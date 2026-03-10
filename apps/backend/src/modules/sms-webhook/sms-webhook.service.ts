import prisma from '../../utils/prisma';

export class SmsWebhookService {
  /**
   * Normalize phone number to digits only, handle Israeli format.
   */
  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[^0-9+]/g, '');
    // Convert +972 to 0
    if (cleaned.startsWith('+972')) {
      cleaned = '0' + cleaned.slice(4);
    } else if (cleaned.startsWith('972')) {
      cleaned = '0' + cleaned.slice(3);
    }
    cleaned = cleaned.replace(/^\+/, '');
    // Ensure leading zero for Israeli mobile numbers (5xxxxxxxx → 05xxxxxxxx)
    if (/^5\d{8}$/.test(cleaned)) {
      cleaned = '0' + cleaned;
    }
    return cleaned;
  }

  /**
   * Parse customer reply text into a response.
   */
  private parseReply(text: string): 'CONFIRMED' | 'DECLINED' | null {
    const trimmed = text.trim().toLowerCase();

    if (['1', 'כן', 'אישור', 'מאשר', 'yes'].includes(trimmed)) return 'CONFIRMED';
    if (['2', 'לא', 'סירוב', 'דחה', 'no'].includes(trimmed)) return 'DECLINED';

    // Starts with 1 or 2 followed only by whitespace/punctuation
    if (/^1[\s.,!]*$/.test(trimmed)) return 'CONFIRMED';
    if (/^2[\s.,!]*$/.test(trimmed)) return 'DECLINED';

    return null;
  }

  /**
   * Process an incoming SMS reply from 019 webhook.
   */
  async processIncomingReply(
    rawPhone: string,
    rawMessage: string,
    fullPayload: any
  ): Promise<{ processed: boolean; orderId?: number; response?: string; error?: string }> {
    const phone = this.normalizePhone(rawPhone);

    // Find the most recent ACTIVE session for this phone
    const session = await prisma.smsReplySession.findFirst({
      where: {
        phone,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
      orderBy: { sentAt: 'desc' },
      include: {
        order: {
          select: { id: true, status: true, customerResponse: true },
        },
      },
    });

    if (!session) {
      console.log(`[SMS Webhook] No active session for phone ${phone}`);
      return { processed: false, error: 'no_active_session' };
    }

    const response = this.parseReply(rawMessage);
    if (!response) {
      console.log(`[SMS Webhook] Unrecognized reply from ${phone}: "${rawMessage}"`);
      // Save the raw reply but keep session ACTIVE for retry
      await prisma.smsReplySession.update({
        where: { id: session.id },
        data: { replyBody: rawMessage },
      });
      return { processed: false, orderId: session.orderId, error: 'unrecognized_reply' };
    }

    // Update the order (same logic as confirmation.service.ts)
    const updateData: any = {
      customerResponse: response,
      respondedAt: new Date(),
    };

    if (response === 'CONFIRMED') {
      updateData.coordinationStatus = 'COORDINATED';

      if (session.order.status === 'PLANNING') {
        updateData.status = 'APPROVED';

        await prisma.orderStatusHistory.create({
          data: {
            orderId: session.orderId,
            fromStatus: session.order.status,
            toStatus: 'APPROVED',
            changedBy: 0, // system
            reason: 'אישור אוטומטי לאחר תגובת SMS',
          },
        });
      }
    }

    await prisma.order.update({
      where: { id: session.orderId },
      data: updateData,
    });

    // Mark session as responded
    await prisma.smsReplySession.update({
      where: { id: session.id },
      data: {
        status: 'RESPONDED',
        repliedAt: new Date(),
        replyBody: rawMessage,
      },
    });

    console.log(`[SMS Webhook] Processed reply for order ${session.orderId}: ${response}`);
    return { processed: true, orderId: session.orderId, response };
  }
}

export const smsWebhookService = new SmsWebhookService();
