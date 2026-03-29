import { Router } from 'express';
import { whatsappWebhookController } from './whatsapp-webhook.controller';

const router = Router();

// Public endpoints – Twilio sends webhooks here (no auth)
router.post('/incoming', whatsappWebhookController.handleIncoming);
router.post('/status', whatsappWebhookController.handleStatus);

export default router;
