import { Request, Response } from 'express';
import { smsWebhookService } from './sms-webhook.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const smsWebhookController = {
  /**
   * Handle incoming SMS from 019 Push API.
   * 019 sends POST with application/x-www-form-urlencoded:
   *   phone=9725xxxxxxxx  (sender - the customer)
   *   message=1           (SMS text)
   *   date=01/04/14 16:05:05
   *   dest=9725xxxxxxxx   (our number)
   *
   * Always returns 200 to prevent provider retries.
   */
  handleIncoming: asyncHandler(async (req: Request, res: Response) => {
    console.log('[SMS Webhook] Incoming:', {
      body: req.body,
      query: req.query,
      ip: req.ip,
    });

    // 019 Push API field names: phone, message, date, dest
    const phone = req.body.phone || req.query.phone;
    const message = req.body.message || req.query.message;

    if (!phone || !message) {
      res.status(200).json({ status: 'ignored', reason: 'missing phone or message' });
      return;
    }

    const result = await smsWebhookService.processIncomingReply(
      String(phone),
      String(message),
      req.body
    );

    res.status(200).json({ status: 'ok', ...result });
  }),

  /**
   * Health check / verification endpoint for 019 setup.
   */
  healthCheck: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'sms-webhook' });
  }),
};
