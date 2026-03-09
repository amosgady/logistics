import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { usersController } from './users.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/', usersController.getAll);
router.post('/', usersController.create);
router.put('/:id', usersController.update);
router.delete('/:id', usersController.delete);

export default router;
