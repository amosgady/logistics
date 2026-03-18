import cron from 'node-cron';
import prisma from '../utils/prisma';
import { smsService } from './sms.service';

type ScheduledTask = ReturnType<typeof cron.schedule>;

const SYSTEM_USER_ID = 0; // Automated sends use ID 0

/**
 * SMS Reminder Scheduler.
 * Manages 3 types of automated reminders:
 * 1. Pre-delivery: X days before delivery date, at a set time
 * 2. Same-day: X hours before the time window on delivery day
 * 3. Next-customer: triggered when a delivery is completed (not cron-based)
 */
export class SmsSchedulerService {
  private cronJob: ScheduledTask | null = null;

  /**
   * Start the scheduler – runs every 5 minutes.
   */
  start() {
    if (this.cronJob) return;

    console.log('[SMS Scheduler] Starting...');
    // Run every 5 minutes
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.processReminders();
      } catch (err) {
        console.error('[SMS Scheduler] Error:', err);
      }
    });

    // Also run once on startup after a short delay
    setTimeout(() => this.processReminders().catch(console.error), 10_000);
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[SMS Scheduler] Stopped.');
    }
  }

  /**
   * Main processing loop – check each reminder type.
   */
  private async processReminders() {
    const config = await prisma.smsReminderConfig.findFirst();
    if (!config) return;

    const smsSettings = await prisma.smsSettings.findFirst({ where: { isActive: true } });
    if (!smsSettings) return; // SMS not configured

    if (config.preDeliveryEnabled) {
      await this.processPreDeliveryReminders(config);
    }

    if (config.sameDayEnabled) {
      await this.processSameDayReminders(config);
    }
  }

  /**
   * Reminder 1: Send SMS X days before delivery at a configured time.
   */
  private async processPreDeliveryReminders(config: {
    preDeliveryDays: number;
    preDeliveryTime: string;
    preDeliveryTemplate: string;
  }) {
    const now = new Date();
    const [targetHour, targetMinute] = config.preDeliveryTime.split(':').map(Number);

    // Only process if we're within the target hour (check once per run window)
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    if (currentHour !== targetHour || currentMinute > targetMinute + 5) {
      return; // Not the right time yet, or already past the window
    }

    // Target delivery date = today + preDeliveryDays
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + config.preDeliveryDays);
    const targetDateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Find orders with delivery on target date that haven't received PRE_DELIVERY SMS
    const startOfDay = new Date(targetDateStr + 'T00:00:00.000Z');
    const endOfDay = new Date(targetDateStr + 'T23:59:59.999Z');

    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ['APPROVED', 'SENT_TO_DRIVER', 'PLANNING', 'ASSIGNED_TO_TRUCK'] },
        phone: { not: '' },
        // Exclude orders that already got this reminder
        NOT: {
          smsLogs: {
            some: { reminderType: 'PRE_DELIVERY' },
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        phone: true,
        address: true,
        city: true,
        deliveryDate: true,
        timeWindow: true,
      },
    });

    console.log(`[SMS Scheduler] Pre-delivery: ${orders.length} orders to notify`);

    for (const order of orders) {
      const message = smsService.expandTemplate(config.preDeliveryTemplate, {
        customerName: order.customerName,
        deliveryDate: new Date(order.deliveryDate).toLocaleDateString('he-IL'),
        timeWindow: order.timeWindow || undefined,
        address: order.address,
        city: order.city,
        orderNumber: order.orderNumber,
      });

      const result = await smsService.send([order.phone], message);

      await prisma.smsLog.create({
        data: {
          orderId: order.id,
          phone: order.phone,
          message,
          status: result.success ? 'SENT' : 'FAILED',
          reminderType: 'PRE_DELIVERY',
          providerRef: result.providerRef || null,
          errorMsg: result.error || null,
          sentBy: SYSTEM_USER_ID,
        },
      });

      // Small delay between sends
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /**
   * Reminder 2: Send SMS X hours before the time window on delivery day.
   */
  private async processSameDayReminders(config: {
    sameDayHoursBefore: number;
    sameDayTemplate: string;
  }) {
    const now = new Date();
    const currentHour = now.getHours();

    // Time windows:
    // MORNING = 08:00-12:00 → send at (8 - hoursBefore)
    // AFTERNOON = 12:00-16:00 → send at (12 - hoursBefore)
    const morningSendHour = 8 - config.sameDayHoursBefore;
    const afternoonSendHour = 12 - config.sameDayHoursBefore;

    // Determine which time window to process right now
    let targetTimeWindow: string | null = null;
    if (currentHour === morningSendHour && now.getMinutes() <= 5) {
      targetTimeWindow = 'MORNING';
    } else if (currentHour === afternoonSendHour && now.getMinutes() <= 5) {
      targetTimeWindow = 'AFTERNOON';
    }

    if (!targetTimeWindow) return;

    const todayStr = now.toISOString().split('T')[0];
    const startOfDay = new Date(todayStr + 'T00:00:00.000Z');
    const endOfDay = new Date(todayStr + 'T23:59:59.999Z');

    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: { gte: startOfDay, lte: endOfDay },
        timeWindow: targetTimeWindow as any,
        status: { in: ['APPROVED', 'SENT_TO_DRIVER'] },
        phone: { not: '' },
        NOT: {
          smsLogs: {
            some: { reminderType: 'SAME_DAY' },
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        phone: true,
        address: true,
        city: true,
        deliveryDate: true,
        timeWindow: true,
      },
    });

    console.log(`[SMS Scheduler] Same-day (${targetTimeWindow}): ${orders.length} orders to notify`);

    for (const order of orders) {
      const message = smsService.expandTemplate(config.sameDayTemplate, {
        customerName: order.customerName,
        deliveryDate: new Date(order.deliveryDate).toLocaleDateString('he-IL'),
        timeWindow: order.timeWindow || undefined,
        address: order.address,
        city: order.city,
        orderNumber: order.orderNumber,
      });

      const result = await smsService.send([order.phone], message);

      await prisma.smsLog.create({
        data: {
          orderId: order.id,
          phone: order.phone,
          message,
          status: result.success ? 'SENT' : 'FAILED',
          reminderType: 'SAME_DAY',
          providerRef: result.providerRef || null,
          errorMsg: result.error || null,
          sentBy: SYSTEM_USER_ID,
        },
      });

      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /**
   * Reminder 3: Notify the next customer in the route after a delivery is completed.
   * Called directly from the delivery flow, NOT from the cron scheduler.
   */
  async notifyNextCustomer(completedOrderId: number) {
    const config = await prisma.smsReminderConfig.findFirst();
    if (!config?.nextCustomerEnabled) return;

    const smsSettings = await prisma.smsSettings.findFirst({ where: { isActive: true } });
    if (!smsSettings) return;

    // Get the completed order with its route info
    const completedOrder = await prisma.order.findUnique({
      where: { id: completedOrderId },
      select: { routeId: true, routeSequence: true },
    });

    if (!completedOrder?.routeId || completedOrder.routeSequence == null) return;

    // Find the next order in the route sequence
    const nextOrder = await prisma.order.findFirst({
      where: {
        routeId: completedOrder.routeId,
        routeSequence: { gt: completedOrder.routeSequence },
        status: { in: ['SENT_TO_DRIVER', 'APPROVED'] },
        phone: { not: '' },
      },
      orderBy: { routeSequence: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        phone: true,
        address: true,
        city: true,
        deliveryDate: true,
        timeWindow: true,
      },
    });

    if (!nextOrder) return;

    // Check if already notified
    const alreadySent = await prisma.smsLog.findFirst({
      where: {
        orderId: nextOrder.id,
        reminderType: 'NEXT_CUSTOMER',
      },
    });

    if (alreadySent) return;

    const message = smsService.expandTemplate(config.nextCustomerTemplate, {
      customerName: nextOrder.customerName,
      deliveryDate: new Date(nextOrder.deliveryDate).toLocaleDateString('he-IL'),
      timeWindow: nextOrder.timeWindow || undefined,
      address: nextOrder.address,
      city: nextOrder.city,
      orderNumber: nextOrder.orderNumber,
    });

    const result = await smsService.send([nextOrder.phone], message);

    await prisma.smsLog.create({
      data: {
        orderId: nextOrder.id,
        phone: nextOrder.phone,
        message,
        status: result.success ? 'SENT' : 'FAILED',
        reminderType: 'NEXT_CUSTOMER',
        providerRef: result.providerRef || null,
        errorMsg: result.error || null,
        sentBy: SYSTEM_USER_ID,
      },
    });

    console.log(`[SMS Scheduler] Next-customer: sent to ${nextOrder.customerName} (order ${nextOrder.orderNumber})`);
  }
}

export const smsScheduler = new SmsSchedulerService();
