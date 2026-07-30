import { Router } from 'express';
import { requireTafnitIp } from '../../middleware/tafnitIp';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { tafnitController } from './tafnit.controller';

const router = Router();

// Inbound from Tafnit ERP — IP-based auth
router.post('/orders', requireTafnitIp, tafnitController.importOrder);

// Internal — JWT auth, admin/coordinator only
router.get('/logs', authMiddleware, requireRole('COORDINATOR', 'ADMIN'), tafnitController.getLogs);
router.post('/freeze', authMiddleware, requireRole('COORDINATOR', 'ADMIN'), tafnitController.freezeOrder);

export default router;
