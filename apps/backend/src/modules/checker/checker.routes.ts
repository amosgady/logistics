import { Router } from 'express';
import { checkerController } from './checker.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('CHECKER', 'ADMIN', 'COORDINATOR'));

router.get('/orders', checkerController.searchOrders);
router.get('/orders/:orderId/lines', checkerController.getOrderLines);
router.patch('/lines/:lineId/check', checkerController.toggleLineCheck);

export default router;
