import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { settingsController } from './settings.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/departments', settingsController.getDepartmentSettings);
router.put('/departments', settingsController.updateDepartmentSettings);

export default router;
