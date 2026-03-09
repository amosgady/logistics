import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { installersController } from './installers.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/', installersController.getAll);
router.post('/', installersController.create);
router.put('/:id', installersController.update);
router.delete('/:id', installersController.delete);

export default router;
