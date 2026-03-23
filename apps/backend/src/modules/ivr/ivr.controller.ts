import { Request, Response } from 'express';

/**
 * IVR Controller - handles Twilio voice webhooks.
 * These endpoints return TwiML (XML) that Twilio reads to the caller.
 */
export const ivrController = {
  /**
   * Test TwiML endpoint - returns a simple Hebrew message with DTMF gather.
   */
  testTwiml: (req: Request, res: Response) => {
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.he-IL-Standard-A" language="he-IL">שלום, יש לך משלוח מחר בין השעות שמונה עד שתים עשרה. לאישור המשלוח הקש אחת. לסירוב הקש שתיים.</Say>
  <Gather numDigits="1" timeout="10" action="/api/v1/ivr/gather-result">
    <Say voice="Google.he-IL-Standard-A" language="he-IL">לאישור המשלוח הקש אחת. לסירוב הקש שתיים.</Say>
  </Gather>
  <Say voice="Google.he-IL-Standard-A" language="he-IL">לא התקבלה תשובה. שלום.</Say>
</Response>`);
  },

  /**
   * Handle DTMF gather result from Twilio.
   */
  gatherResult: (req: Request, res: Response) => {
    const digits = req.body?.Digits || req.query?.Digits;
    const callSid = req.body?.CallSid || req.query?.CallSid;

    console.log(`[IVR] Call ${callSid} pressed: ${digits}`);

    res.type('text/xml');
    if (digits === '1') {
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.he-IL-Standard-A" language="he-IL">תודה. המשלוח אושר. שלום.</Say>
</Response>`);
    } else if (digits === '2') {
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.he-IL-Standard-A" language="he-IL">המשלוח סורב. נציג יצור איתך קשר. שלום.</Say>
</Response>`);
    } else {
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.he-IL-Standard-A" language="he-IL">לחיצה לא תקינה. לאישור הקש אחת. לסירוב הקש שתיים.</Say>
  <Gather numDigits="1" timeout="10" action="/api/v1/ivr/gather-result">
    <Say voice="Google.he-IL-Standard-A" language="he-IL">לאישור הקש אחת. לסירוב הקש שתיים.</Say>
  </Gather>
  <Say voice="Google.he-IL-Standard-A" language="he-IL">לא התקבלה תשובה. שלום.</Say>
</Response>`);
    }
  },
};
