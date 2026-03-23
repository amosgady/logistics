import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { ivrController } from './ivr.controller';

const router = Router();

// Public routes (Twilio webhooks - no auth)
router.get('/twiml/order/:orderId', ivrController.orderTwiml);
router.post('/twiml/order/:orderId', ivrController.orderTwiml);
router.post('/gather/:orderId', ivrController.gatherOrder);

// Protected routes (user-initiated calls)
router.post('/call/order/:orderId', authMiddleware, requireRole('ADMIN', 'COORDINATOR'), ivrController.callOrder);

export default router;
