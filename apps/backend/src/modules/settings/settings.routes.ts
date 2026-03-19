import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { settingsController } from './settings.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/departments', settingsController.getDepartmentSettings);
router.put('/departments', settingsController.updateDepartmentSettings);
router.get('/truck-colors', settingsController.getTruckColors);
router.put('/truck-colors', settingsController.updateTruckColors);
router.get('/truck-sizes', settingsController.getTruckSizes);
router.put('/truck-sizes', settingsController.updateTruckSizes);
router.get('/truck-types', settingsController.getTruckTypes);
router.put('/truck-types', settingsController.updateTruckTypes);

export default router;
