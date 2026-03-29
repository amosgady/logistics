import prisma from '../../utils/prisma';
import { whatsappService as whatsappProvider } from '../../services/whatsapp.service';

const WEEKDAY_NAMES: Record<number, string> = {
  0: 'יום ראשון', 1: 'יום שני', 2: 'יום שלישי', 3: 'יום רביעי', 4: 'יום חמישי', 5: 'יום שישי', 6: 'שבת',
};

export class WhatsappModuleService {
  /**
   * Send WhatsApp template message for a single order.
   */
  async sendOrderWhatsapp(orderId: number, sentBy: number, targetPhone?: string) {
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
      },
    });

    if (!order) {
      throw new Error('הזמנה לא נמצאה');
    }

    const phoneToUse = targetPhone || order.phone;
    if (!phoneToUse) {
      throw new Error('אין מספר טלפון להזמנה');
    }

    // Build template variable {{2}}: date + time + address combined
    const date = order.deliveryDate ? new Date(order.deliveryDate) : new Date();
    const dateStr = date.toLocaleDateString('he-IL');
    const weekday = WEEKDAY_NAMES[date.getDay()] || '';
    const timeStr = order.timeWindow === 'MORNING' ? '8:00-12:00' : order.timeWindow === 'AFTERNOON' ? '12:00-16:00' : '';
    const addressStr = [order.address, order.city].filter(Boolean).join(', ');

    const detailsParts = [dateStr, weekday, timeStr, addressStr].filter(Boolean);
    const detailsStr = detailsParts.join(' ');

    // Template variables: {{1}} = customer name, {{2}} = delivery details
    const contentVariables = {
      '1': order.customerName || 'לקוח',
      '2': detailsStr,
    };

    // Reset customer response
    await prisma.order.update({
      where: { id: orderId },
      data: {
        customerResponse: 'PENDING',
        customerNotes: null,
        respondedAt: null,
      },
    });

    const result = await whatsappProvider.sendTemplate(phoneToUse, contentVariables);

    // Log to SmsLog with channel = 'whatsapp'
    await prisma.smsLog.create({
      data: {
        orderId: order.id,
        phone: phoneToUse,
        message: `[WhatsApp] ${order.customerName} - ${detailsStr}`,
        status: result.success ? 'SENT' : 'FAILED',
        providerRef: result.messageSid || null,
        errorMsg: result.error || null,
        channel: 'whatsapp',
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
   * Send WhatsApp to all orders in a route.
   */
  async sendRouteWhatsapp(routeId: number, sentBy: number) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        orders: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            phone: true,
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
        const result = await this.sendOrderWhatsapp(order.id, sentBy);
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

      // Small delay between sends
      await new Promise((r) => setTimeout(r, 100));
    }

    const sentCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return { sentCount, failedCount, total: results.length, details: results };
  }
}

export const whatsappModuleService = new WhatsappModuleService();
