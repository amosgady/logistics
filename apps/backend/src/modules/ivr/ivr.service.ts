import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
const BASE_URL = process.env.BASE_URL || 'https://log.perfectlinesite.com';

class IvrService {
  /**
   * Initiate an IVR confirmation call for an order.
   */
  async callOrder(orderId: number, sentBy: number, targetPhone?: string) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new AppError(500, 'IVR_NOT_CONFIGURED', 'Twilio IVR לא מוגדר');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, phone: true, phone2: true, customerName: true },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'הזמנה לא נמצאה');
    }

    const phone = targetPhone || order.phone;
    if (!phone) {
      throw new AppError(400, 'NO_PHONE', 'אין מספר טלפון');
    }

    // Normalize phone to +972 format
    let normalizedPhone = phone.replace(/[-\s]/g, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '+972' + normalizedPhone.slice(1);
    } else if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+972' + normalizedPhone;
    }

    const twimlUrl = `${BASE_URL}/api/v1/ivr/twiml/order/${orderId}`;

    // Make the call via Twilio REST API
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const body = new URLSearchParams({
      To: normalizedPhone,
      From: TWILIO_PHONE_NUMBER,
      Url: twimlUrl,
      StatusCallback: `${BASE_URL}/api/v1/ivr/status/${orderId}`,
      StatusCallbackMethod: 'POST',
      StatusCallbackEvent: 'completed',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (data.sid) {
      console.log(`[IVR] Call initiated for order ${orderId} to ${normalizedPhone}, CallSid: ${data.sid}`);
      return { callSid: data.sid, phone: normalizedPhone, status: 'queued' };
    } else {
      console.error('[IVR] Failed to initiate call:', data);
      throw new AppError(500, 'IVR_CALL_FAILED', `שגיאה בחיוג: ${data.message || 'unknown'}`);
    }
  }
}

export const ivrService = new IvrService();
