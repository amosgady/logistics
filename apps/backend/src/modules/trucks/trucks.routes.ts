import { Router } from 'express';
import { trucksController } from './trucks.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.get('/', trucksController.getAll);
router.get('/:id', trucksController.getById);
router.get('/:id/load', requireRole('COORDINATOR', 'ADMIN'), trucksController.getTruckLoad);
router.post('/', requireRole('ADMIN'), trucksController.create);
router.put('/:id', requireRole('ADMIN'), trucksController.update);
router.delete('/:id', requireRole('ADMIN'), trucksController.delete);

export default router;
