import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ivrService } from './ivr.service';
import prisma from '../../utils/prisma';

const VOICE = 'Google.he-IL-Standard-A';
const LANG = 'he-IL';

function numberToHebrew(n: number): string {
  const map: Record<number, string> = {
    0: 'אפס', 1: 'אחת', 2: 'שתיים', 3: 'שלוש', 4: 'ארבע', 5: 'חמש',
    6: 'שש', 7: 'שבע', 8: 'שמונה', 9: 'תשע', 10: 'עשר',
    11: 'אחת עשרה', 12: 'שתים עשרה', 13: 'שלוש עשרה', 14: 'ארבע עשרה',
    15: 'חמש עשרה', 16: 'שש עשרה', 17: 'שבע עשרה', 18: 'שמונה עשרה',
    19: 'תשע עשרה', 20: 'עשרים', 21: 'עשרים ואחת', 22: 'עשרים ושתיים',
    23: 'עשרים ושלוש', 24: 'עשרים וארבע',
  };
  return map[n] || String(n);
}

function timeWindowToHebrew(tw: string | null): string {
  if (tw === 'MORNING') return 'שמונה עד שתים עשרה';
  if (tw === 'AFTERNOON') return 'שתים עשרה עד שש עשרה';
  return 'שמונה עד שש עשרה';
}

function daysUntilHebrew(deliveryDate: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(deliveryDate);
  delivery.setHours(0, 0, 0, 0);
  const diffDays = Math.round((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'היום';
  if (diffDays === 1) return 'מחר';
  if (diffDays === 2) return 'בעוד יומיים';
  if (diffDays === 3) return 'בעוד שלושה ימים';
  return `בעוד ${numberToHebrew(diffDays)} ימים`;
}

export const ivrController = {
  /**
   * Initiate an IVR call for an order.
   */
  callOrder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const targetPhone = req.body?.phone as string | undefined;
    const result = await ivrService.callOrder(orderId, req.user!.userId, targetPhone);
    res.json({ success: true, data: result });
  }),

  /**
   * TwiML endpoint for order confirmation call.
   * Twilio fetches this URL when the call is answered.
   */
  orderTwiml: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerName: true, address: true, city: true, deliveryDate: true, timeWindow: true },
    });

    if (!order) {
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="${VOICE}" language="${LANG}">שגיאה. הזמנה לא נמצאה. שלום.</Say></Response>`);
      return;
    }

    const daysText = daysUntilHebrew(order.deliveryDate);
    const timeText = timeWindowToHebrew(order.timeWindow);
    const address = order.city || order.address || '';

    const dateStr = order.deliveryDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
    const message = `שלום, חברת פרפקט ליין מתכננת לספק לך את הזמנתך בתאריך ${dateStr}, לכתובת ${address}, בין השעות ${timeText}. לאישור הקש אחת. לסירוב הקש שתיים.`;

    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANG}">${message}</Say>
  <Gather numDigits="1" timeout="10" action="/api/v1/ivr/gather/${orderId}">
    <Say voice="${VOICE}" language="${LANG}">לאישור הקש אחת. לסירוב הקש שתיים.</Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANG}">לא התקבלה תשובה. שלום.</Say>
</Response>`);
  },

  /**
   * Handle DTMF gather result and update order coordination status.
   */
  gatherOrder: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const digits = req.body?.Digits || req.query?.Digits;
    const callSid = req.body?.CallSid || req.query?.CallSid;

    console.log(`[IVR] Order ${orderId}, Call ${callSid}, pressed: ${digits}`);

    res.type('text/xml');

    if (digits === '1') {
      // Update order as COORDINATED
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: { customerResponse: 'CONFIRMED', coordinationStatus: 'COORDINATED' },
        });
        console.log(`[IVR] Order ${orderId} CONFIRMED via IVR`);
      } catch (err: any) {
        console.error(`[IVR] Error updating order ${orderId}:`, err.message);
      }

      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANG}">תודה רבה. המשלוח אושר. שלום.</Say>
</Response>`);
    } else if (digits === '2') {
      // Update order as DECLINED
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: { customerResponse: 'DECLINED' },
        });
        console.log(`[IVR] Order ${orderId} DECLINED via IVR`);
      } catch (err: any) {
        console.error(`[IVR] Error updating order ${orderId}:`, err.message);
      }

      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANG}">המשלוח סורב. נציג יצור איתך קשר. שלום.</Say>
</Response>`);
    } else {
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANG}">לחיצה לא תקינה.</Say>
  <Gather numDigits="1" timeout="10" action="/api/v1/ivr/gather/${orderId}">
    <Say voice="${VOICE}" language="${LANG}">לאישור הקש אחת. לסירוב הקש שתיים.</Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANG}">לא התקבלה תשובה. שלום.</Say>
</Response>`);
    }
  },
};
