import { Router } from 'express';
import multer from 'multer';
import { ordersController } from './orders.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.use(authMiddleware);

router.get('/', requireRole('COORDINATOR', 'ADMIN'), ordersController.getOrders);
router.get('/:id', ordersController.getOrderById);
router.post('/import', requireRole('COORDINATOR', 'ADMIN'), upload.single('file'), ordersController.importCsv);
router.post('/import/analyze', requireRole('COORDINATOR', 'ADMIN'), upload.single('file'), ordersController.analyzeCsvImport);
router.patch('/:id/status', requireRole('COORDINATOR', 'ADMIN'), ordersController.changeStatus);
router.post('/bulk-status', requireRole('COORDINATOR', 'ADMIN'), ordersController.bulkChangeStatus);
router.post('/bulk-delete', requireRole('COORDINATOR', 'ADMIN'), ordersController.bulkDelete);
router.delete('/:id', requireRole('COORDINATOR', 'ADMIN'), ordersController.deleteOrder);
router.patch('/:id/delivery-date', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateDeliveryDate);
router.patch('/:id/zone', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateZone);
router.patch('/:id/coordination', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateCoordination);
router.patch('/:id/pallet-count', requireRole('COORDINATOR', 'ADMIN'), ordersController.updatePalletCount);

export default router;
