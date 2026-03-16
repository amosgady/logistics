import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { driversController } from './drivers.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/', driversController.getAll);
router.post('/', driversController.create);
router.put('/:id', driversController.update);
router.patch('/:id/deactivate', driversController.deactivate);
router.delete('/:id', driversController.delete);

export default router;
