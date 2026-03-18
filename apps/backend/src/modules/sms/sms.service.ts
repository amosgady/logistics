import { randomUUID } from 'crypto';
import prisma from '../../utils/prisma';
import { smsService as smsProvider } from '../../services/sms.service';
import { env } from '../../config/env';

export class SmsModuleService {
  private readonly DEFAULT_REPLY_TEMPLATE =
    'שלום {customerName}, האם אתה מאשר הובלה ליום {deliveryDate}? לאישור הקש 1, לסירוב הקש 2';

  /**
   * Send SMS with confirmation link or reply-based (1/2) for a single order.
   * @param targetPhone – optional override; if not given, sends to order.phone
   */
  async sendOrderSms(orderId: number, sentBy: number, targetPhone?: string, methodOverride?: 'LINK' | 'REPLY') {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        phone: true,
        phone2: true,
        address: true,
        city: true,
        deliveryDate: true,
        timeWindow: true,
        confirmToken: true,
      },
    });

    if (!order) {
      throw new Error('הזמנה לא נמצאה');
    }

    // Use the specified phone, or fall back to order.phone
    const phoneToUse = targetPhone || order.phone;
    if (!phoneToUse) {
      throw new Error('אין מספר טלפון להזמנה');
    }

    // Get SMS settings to determine confirmation method
    const smsSettings = await prisma.smsSettings.findFirst({
      where: { isActive: true },
    });
    const confirmationMethod = methodOverride || smsSettings?.confirmationMethod || 'LINK';

    let message: string;

    if (confirmationMethod === 'REPLY') {
      // Reply-based: "reply 1 or 2" message
      const deliveryDateStr = new Date(order.deliveryDate).toLocaleDateString('he-IL');
      const replyTemplate = smsSettings?.replyTemplate || this.DEFAULT_REPLY_TEMPLATE;

      message = replyTemplate
        .replace(/{customerName}/g, order.customerName || '')
        .replace(/{deliveryDate}/g, deliveryDateStr)
        .replace(/{orderNumber}/g, order.orderNumber || '');

      // Normalize phone for session matching (must match sms-webhook normalizePhone)
      let normalizedPhone = phoneToUse.replace(/[^0-9+]/g, '');
      if (normalizedPhone.startsWith('+972')) {
        normalizedPhone = '0' + normalizedPhone.slice(4);
      } else if (normalizedPhone.startsWith('972')) {
        normalizedPhone = '0' + normalizedPhone.slice(3);
      }
      normalizedPhone = normalizedPhone.replace(/^\+/, '');
      // Ensure leading zero for Israeli mobile numbers (5xxxxxxxx → 05xxxxxxxx)
      if (/^5\d{8}$/.test(normalizedPhone)) {
        normalizedPhone = '0' + normalizedPhone;
      }

      // Expire any previous active sessions for this phone+order
      await prisma.smsReplySession.updateMany({
        where: { orderId, phone: normalizedPhone, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });

      // Create new reply session
      await prisma.smsReplySession.create({
        data: {
          orderId,
          phone: normalizedPhone,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 day TTL
        },
      });
    } else {
      // Link-based: existing behavior
      let token = order.confirmToken;
      if (!token) {
        token = randomUUID();
      }

      await prisma.order.update({
        where: { id: orderId },
        data: { confirmToken: token },
      });

      const confirmUrl = `${env.BASE_URL}/confirm/${token}`;
      message = `"${order.customerName}" שלום, אנחנו מתכננים לספק לך את הזמנתך מחברת פרפקט ליין. נא לחץ על הקישור ואשר את מועד האספקה: ${confirmUrl}`;
    }

    // Reset customer response (both methods)
    await prisma.order.update({
      where: { id: orderId },
      data: {
        customerResponse: 'PENDING',
        customerNotes: null,
        respondedAt: null,
      },
    });

    // Send SMS - use replySenderPhone for REPLY method, senderName for LINK
    const senderOverride = confirmationMethod === 'REPLY' && (smsSettings as any)?.replySenderPhone
      ? (smsSettings as any).replySenderPhone
      : undefined;
    const result = await smsProvider.send([phoneToUse], message, senderOverride);

    // Log
    await prisma.smsLog.create({
      data: {
        orderId: order.id,
        phone: phoneToUse,
        message,
        status: result.success ? 'SENT' : 'FAILED',
        providerRef: result.providerRef || null,
        errorMsg: result.error || null,
        sentBy,
      },
    });

    return {
      success: result.success,
      phone: phoneToUse,
      orderNumber: order.orderNumber,
      error: result.error,
    };
  }

  /**
   * Send SMS to all orders in a route.
   */
  async sendRouteSms(routeId: number, sentBy: number, methodOverride?: 'LINK' | 'REPLY') {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        orders: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            phone: true,
            address: true,
            city: true,
            deliveryDate: true,
            timeWindow: true,
            status: true,
          },
          orderBy: { routeSequence: 'asc' },
        },
      },
    });

    if (!route) {
      throw new Error('מסלול לא נמצא');
    }

    const results: {
      orderId: number;
      orderNumber: string;
      phone: string;
      success: boolean;
      error?: string;
    }[] = [];

    for (const order of route.orders) {
      if (!order.phone) {
        results.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          phone: '',
          success: false,
          error: 'אין מספר טלפון',
        });
        continue;
      }

      try {
        const result = await this.sendOrderSms(order.id, sentBy, undefined, methodOverride);
        results.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          phone: result.phone,
          success: true,
        });
      } catch (err: any) {
        results.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          phone: order.phone,
          success: false,
          error: err.message,
        });
      }

      // Small delay between sends to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    const sentCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return { sentCount, failedCount, total: results.length, details: results };
  }

  /**
   * Get SMS logs (optionally filtered by orderId).
   */
  async getLogs(filters: { orderId?: number; limit?: number; offset?: number }) {
    const where: any = {};
    if (filters.orderId) where.orderId = filters.orderId;

    const [logs, total] = await Promise.all([
      prisma.smsLog.findMany({
        where,
        include: {
          order: {
            select: { orderNumber: true, customerName: true },
          },
        },
        orderBy: { sentAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      prisma.smsLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Get SMS settings.
   */
  async getSettings() {
    const settings = await prisma.smsSettings.findFirst({
      where: { isActive: true },
    });
    return settings;
  }

  /**
   * Update (upsert) SMS settings.
   */
  async updateSettings(data: {
    inforuUsername: string;
    inforuPassword: string;
    apiToken?: string | null;
    senderName: string;
    replySenderPhone?: string | null;
    messageTemplate: string;
    isActive: boolean;
    confirmationMethod?: 'LINK' | 'REPLY';
    replyTemplate?: string | null;
  }) {
    const existing = await prisma.smsSettings.findFirst();

    // Only include apiToken if explicitly provided
    const updateData: any = {
      inforuUsername: data.inforuUsername,
      inforuPassword: data.inforuPassword,
      senderName: data.senderName,
      messageTemplate: data.messageTemplate,
      isActive: data.isActive,
    };
    if (data.apiToken !== undefined) {
      updateData.apiToken = data.apiToken;
    }
    if (data.confirmationMethod !== undefined) {
      updateData.confirmationMethod = data.confirmationMethod;
    }
    if (data.replyTemplate !== undefined) {
      updateData.replyTemplate = data.replyTemplate;
    }
    if (data.replySenderPhone !== undefined) {
      updateData.replySenderPhone = data.replySenderPhone;
    }

    if (existing) {
      return prisma.smsSettings.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    return prisma.smsSettings.create({ data: updateData });
  }

  /**
   * Generate API token via 019 API.
   */
  async generateToken() {
    return smsProvider.generateToken();
  }

  /**
   * Send a test SMS to verify configuration.
   */
  async sendTest(phone: string, sentBy: number) {
    const result = await smsProvider.send([phone], 'הודעת בדיקה ממערכת ניהול הובלות');

    await prisma.smsLog.create({
      data: {
        phone,
        message: 'הודעת בדיקה ממערכת ניהול הובלות',
        status: result.success ? 'SENT' : 'FAILED',
        providerRef: result.providerRef || null,
        errorMsg: result.error || null,
        sentBy,
      },
    });

    return result;
  }

  /**
   * Get reminder configuration.
   */
  async getReminderConfig() {
    const config = await prisma.smsReminderConfig.findFirst();
    return config;
  }

  /**
   * Update (upsert) reminder configuration.
   */
  async updateReminderConfig(data: {
    preDeliveryEnabled: boolean;
    preDeliveryDays: number;
    preDeliveryTime: string;
    preDeliveryTemplate: string;
    sameDayEnabled: boolean;
    sameDayHoursBefore: number;
    sameDayTemplate: string;
    nextCustomerEnabled: boolean;
    nextCustomerTemplate: string;
  }) {
    const existing = await prisma.smsReminderConfig.findFirst();

    if (existing) {
      return prisma.smsReminderConfig.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.smsReminderConfig.create({ data });
  }
}

export const smsModuleService = new SmsModuleService();
