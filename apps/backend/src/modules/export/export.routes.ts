import { Router } from 'express';
import { exportController } from './export.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('COORDINATOR', 'ADMIN'));

router.post('/send-to-driver', exportController.sendToDriver);
router.post('/unsend-from-driver', exportController.unsendFromDriver);
router.post('/unsend-order', exportController.unsendOrder);
router.post('/export-wms', exportController.exportWmsCsv);

export default router;
