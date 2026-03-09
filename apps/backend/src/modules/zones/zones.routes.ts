import { Router } from 'express';
import { zonesController } from './zones.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.get('/', zonesController.getAll);
router.get('/:id', zonesController.getById);
router.post('/', requireRole('ADMIN'), zonesController.create);
router.put('/:id', requireRole('ADMIN'), zonesController.update);
router.post('/:id/cities', requireRole('ADMIN'), zonesController.addCities);
router.delete('/:id/cities/:cityId', requireRole('ADMIN'), zonesController.removeCity);
router.post('/assign', requireRole('COORDINATOR', 'ADMIN'), zonesController.assignZones);

export default router;
