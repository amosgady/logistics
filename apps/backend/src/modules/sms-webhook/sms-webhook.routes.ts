import { Router } from 'express';
import { smsWebhookController } from './sms-webhook.controller';

const router = Router();

// Public routes – no auth required (019 sends callbacks here)
router.post('/incoming', smsWebhookController.handleIncoming);
router.get('/incoming', smsWebhookController.healthCheck);

export default router;
