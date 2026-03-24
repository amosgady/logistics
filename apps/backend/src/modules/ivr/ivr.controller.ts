import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ivrService } from './ivr.service';
import prisma from '../../utils/prisma';
import { env } from '../../config/env';
import { ttsService } from '../../services/tts.service';

const BASE = env.BASE_URL || 'https://log.perfectlinesite.com';

const MONTH_NAMES: Record<number, string> = {
  1: 'ינואר', 2: 'פברואר', 3: 'מרץ', 4: 'אפריל', 5: 'מאי', 6: 'יוני',
  7: 'יולי', 8: 'אוגוסט', 9: 'ספטמבר', 10: 'אוקטובר', 11: 'נובמבר', 12: 'דצמבר',
};

const WEEKDAY_NAMES: Record<number, string> = {
  0: 'ראשון', 1: 'שני', 2: 'שלישי', 3: 'רביעי', 4: 'חמישי', 5: 'שישי', 6: 'שבת',
};

const STATIC_MESSAGES = {
  confirm_prompt: 'לאישור המשלוח הקש 1, לסירוב הקש 2, לשמיעה חוזרת הקש 3',
  confirmed: 'תודה, המשלוח אושר בהצלחה',
  declined: 'המשלוח סורב, נציג יחזור אליך בהקדם',
  invalid: 'הקלדה לא חוקית',
  no_response: 'לא התקבלה תגובה, להתראות',
};

/**
 * Build dynamic Hebrew IVR message from order data.
 */
function buildOrderMessage(order: {
  address: string;
  city: string;
  deliveryDate: Date | null;
  timeWindow: string | null;
}): string {
  const date = order.deliveryDate ? new Date(order.deliveryDate) : new Date();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const monthName = MONTH_NAMES[month];
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const timeWindow = order.timeWindow === 'AFTERNOON' ? '12 עד 4 אחר הצהריים' : '8 עד 12';
  const address = `${order.address}, ${order.city}`;

  return `המשלוח שלך לכתובת ${address}, מתוכנן לתאריך ${day} ב${monthName}, ביום ${weekday}, בשעות ${timeWindow}`;
}

/**
 * Generate TTS audio URL for a given text, with error handling.
 */
async function getTtsUrl(text: string): Promise<string> {
  try {
    return await ttsService.generate(text);
  } catch (err: any) {
    console.error('[IVR] TTS generation failed:', err.message);
    throw err;
  }
}

export const ivrController = {
  /**
   * Initiate an IVR call for an order.
   * Pre-generates all TTS audio before starting the call so Twilio gets instant TwiML responses.
   */
  callOrder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const targetPhone = req.body?.phone as string | undefined;

    // Pre-generate all audio files before initiating the call
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, address: true, city: true, deliveryDate: true, timeWindow: true },
    });

    if (order) {
      const messageText = buildOrderMessage(order);
      console.log(`[IVR] Pre-generating TTS audio for order ${orderId}...`);
      await Promise.all([
        getTtsUrl(messageText),
        getTtsUrl(STATIC_MESSAGES.confirm_prompt),
        getTtsUrl(STATIC_MESSAGES.confirmed),
        getTtsUrl(STATIC_MESSAGES.declined),
        getTtsUrl(STATIC_MESSAGES.invalid),
        getTtsUrl(STATIC_MESSAGES.no_response),
      ]);
      console.log(`[IVR] TTS audio ready for order ${orderId}`);
    }

    const result = await ivrService.callOrder(orderId, req.user!.userId, targetPhone);
    res.json({ success: true, data: result });
  }),

  /**
   * TwiML endpoint for order confirmation call.
   * Twilio fetches this URL when the call is answered.
   * Uses Nakdimon + edge-tts for dynamic Hebrew speech.
   */
  orderTwiml: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, address: true, city: true, deliveryDate: true, timeWindow: true },
    });

    if (!order) {
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      return;
    }

    try {
      const messageText = buildOrderMessage(order);
      const [mainAudioUrl, promptAudioUrl, noResponseUrl] = await Promise.all([
        getTtsUrl(messageText),
        getTtsUrl(STATIC_MESSAGES.confirm_prompt),
        getTtsUrl(STATIC_MESSAGES.no_response),
      ]);

      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${BASE}/uploads/ivr/intro.mp3</Play>
  <Play>${mainAudioUrl}</Play>
  <Gather numDigits="1" timeout="10" action="${BASE}/api/v1/ivr/gather/${orderId}" method="POST">
    <Play>${promptAudioUrl}</Play>
  </Gather>
  <Play>${noResponseUrl}</Play>
</Response>`);
    } catch (err: any) {
      console.error(`[IVR] Failed to generate TTS for order ${orderId}:`, err.message);
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    }
  },

  /**
   * Handle DTMF gather result and update order coordination status.
   */
  gatherOrder: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const digits = req.body?.Digits || req.query?.Digits;

    console.log(`[IVR] Order ${orderId}, pressed: ${digits}`);

    res.type('text/xml');

    if (digits === '1') {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            customerResponse: 'CONFIRMED',
            coordinationStatus: 'COORDINATED',
            respondedAt: new Date(),
            customerNotes: 'אושר בשיחת IVR',
          },
        });
        console.log(`[IVR] Order ${orderId} CONFIRMED via IVR`);
      } catch (err: any) {
        console.error(`[IVR] Error updating order ${orderId}:`, err.message);
      }

      try {
        const confirmedUrl = await getTtsUrl(STATIC_MESSAGES.confirmed);
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Play>${confirmedUrl}</Play></Response>`);
      } catch {
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      }
    } else if (digits === '2') {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            customerResponse: 'DECLINED',
            respondedAt: new Date(),
            customerNotes: 'סורב בשיחת IVR',
          },
        });
        console.log(`[IVR] Order ${orderId} DECLINED via IVR`);
      } catch (err: any) {
        console.error(`[IVR] Error updating order ${orderId}:`, err.message);
      }

      try {
        const declinedUrl = await getTtsUrl(STATIC_MESSAGES.declined);
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Play>${declinedUrl}</Play></Response>`);
      } catch {
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      }
    } else if (digits === '3') {
      // Replay: redirect back to TwiML endpoint to replay the full message
      console.log(`[IVR] Order ${orderId} requested replay`);
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Redirect method="POST">${BASE}/api/v1/ivr/twiml/order/${orderId}</Redirect></Response>`);
    } else {
      try {
        const [invalidUrl, promptUrl, noResponseUrl] = await Promise.all([
          getTtsUrl(STATIC_MESSAGES.invalid),
          getTtsUrl(STATIC_MESSAGES.confirm_prompt),
          getTtsUrl(STATIC_MESSAGES.no_response),
        ]);
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${invalidUrl}</Play>
  <Gather numDigits="1" timeout="10" action="${BASE}/api/v1/ivr/gather/${orderId}" method="POST">
    <Play>${promptUrl}</Play>
  </Gather>
  <Play>${noResponseUrl}</Play>
</Response>`);
      } catch {
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      }
    }
  },

  /**
   * Handle call status callback.
   */
  statusCallback: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const callStatus = req.body?.CallStatus || '';

    if (['no-answer', 'busy', 'failed', 'canceled'].includes(callStatus)) {
      console.log(`[IVR Status] Order ${orderId}: ${callStatus}`);
      const statusMap: Record<string, string> = {
        'no-answer': 'לא ענה',
        'busy': 'תפוס',
        'failed': 'נכשל',
        'canceled': 'בוטל',
      };
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: { customerNotes: `שיחת IVR: ${statusMap[callStatus] || callStatus}` },
        });
      } catch { /* ignore */ }
    }

    res.status(200).send('OK');
  },
};
