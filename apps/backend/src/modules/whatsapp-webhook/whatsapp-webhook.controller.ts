import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import prisma from '../../utils/prisma';

/**
 * Normalize phone from WhatsApp format (whatsapp:+972...) to 05... format.
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace('whatsapp:', '').replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+972')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('972')) {
    cleaned = '0' + cleaned.slice(3);
  }
  cleaned = cleaned.replace(/^\+/, '');
  if (/^5\d{8}$/.test(cleaned)) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

/**
 * Parse WhatsApp button text to customer response.
 */
function parseButtonResponse(text: string): 'CONFIRMED' | 'DECLINED' | null {
  const trimmed = text.trim();
  if (trimmed === 'מאשר') return 'CONFIRMED';
  if (trimmed === 'לא מתאים') return 'DECLINED';
  // Also support numeric/text fallbacks
  if (['1', 'כן', 'אישור', 'yes'].includes(trimmed.toLowerCase())) return 'CONFIRMED';
  if (['2', 'לא', 'סירוב', 'no'].includes(trimmed.toLowerCase())) return 'DECLINED';
  return null;
}

export const whatsappWebhookController = {
  /**
   * Handle incoming WhatsApp messages (button clicks from customers).
   * Twilio sends: Body, From (whatsapp:+972...), To, MessageSid, WaId, ButtonText
   */
  handleIncoming: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body?.Body || req.body?.ButtonText || '';
    const from = req.body?.From || '';
    const messageSid = req.body?.MessageSid || '';

    console.log(`[WhatsApp Webhook] Incoming from ${from}: "${body}" (SID: ${messageSid})`);

    if (!from || !body) {
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
      return;
    }

    const phone = normalizePhone(from);
    const response = parseButtonResponse(body);

    if (!response) {
      console.log(`[WhatsApp Webhook] Unrecognized response from ${phone}: "${body}"`);
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
      return;
    }

    // Find the most recent WhatsApp message sent to this phone
    // Normalize phone variants for matching
    const phoneVariants = [phone];
    if (phone.startsWith('0')) {
      phoneVariants.push('+972' + phone.slice(1));
      phoneVariants.push('972' + phone.slice(1));
    }

    const recentLog = await prisma.smsLog.findFirst({
      where: {
        phone: { in: phoneVariants },
        channel: 'whatsapp',
        status: 'SENT',
        sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // last 7 days
      },
      orderBy: { sentAt: 'desc' },
      select: { orderId: true },
    });

    if (!recentLog?.orderId) {
      console.log(`[WhatsApp Webhook] No recent WhatsApp message found for ${phone}`);
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
      return;
    }

    const orderId = recentLog.orderId;

    // Get current order status
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, customerResponse: true },
    });

    if (!order) {
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
      return;
    }

    // Update the order
    const updateData: any = {
      customerResponse: response,
      respondedAt: new Date(),
      customerNotes: `אושר בוואטסאפ - ${body}`,
    };

    if (response === 'CONFIRMED') {
      updateData.coordinationStatus = 'COORDINATED';

      if (order.status === 'PLANNING' || order.status === 'ASSIGNED_TO_TRUCK') {
        updateData.status = 'APPROVED';

        await prisma.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: 'APPROVED',
            changedBy: 0, // system
            reason: 'אישור אוטומטי לאחר תגובת WhatsApp',
          },
        });
      }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    console.log(`[WhatsApp Webhook] Order ${orderId} ${response} via WhatsApp`);

    // Return empty TwiML response
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }),

  /**
   * Handle WhatsApp message status callbacks from Twilio.
   * Twilio sends: MessageSid, MessageStatus (sent/delivered/read/failed), To, From
   */
  handleStatus: asyncHandler(async (req: Request, res: Response) => {
    const messageSid = req.body?.MessageSid || '';
    const messageStatus = req.body?.MessageStatus || '';

    if (messageSid && messageStatus) {
      // Map Twilio status to our delivery status
      const statusMap: Record<string, string> = {
        'queued': 'PENDING',
        'sent': 'SENT',
        'delivered': 'DELIVERED',
        'read': 'READ',
        'failed': 'FAILED',
        'undelivered': 'UNDELIVERED',
      };

      const deliveryStatus = statusMap[messageStatus] || messageStatus.toUpperCase();

      await prisma.smsLog.updateMany({
        where: { providerRef: messageSid },
        data: {
          deliveryStatus,
          deliveryCheckedAt: new Date(),
        },
      });

      console.log(`[WhatsApp Status] ${messageSid}: ${messageStatus} → ${deliveryStatus}`);
    }

    res.status(200).send('OK');
  }),
};
