import { Router } from 'express';
import { checkerController } from './checker.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('CHECKER', 'ADMIN', 'COORDINATOR'));

router.get('/orders', checkerController.searchOrders);
router.get('/orders/:orderId/lines', checkerController.getOrderLines);
router.patch('/lines/:lineId/check', checkerController.toggleLineCheck);
router.patch('/orders/:orderId/checker-note', checkerController.updateCheckerNote);
router.patch('/orders/:orderId/pallet-count', checkerController.updateOrderPalletCount);
router.patch('/lines/:lineId/checker-note', checkerController.updateLineCheckerNote);

export default router;
