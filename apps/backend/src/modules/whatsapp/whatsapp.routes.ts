import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { whatsappController } from './whatsapp.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN', 'COORDINATOR'));

// Send WhatsApp for single order
router.post('/send/order/:orderId', whatsappController.sendOrderWhatsapp);

// Send WhatsApp for all orders in a route
router.post('/send/route/:routeId', whatsappController.sendRouteWhatsapp);

export default router;
