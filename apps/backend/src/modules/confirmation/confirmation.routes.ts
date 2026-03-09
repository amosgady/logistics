import { Router } from 'express';
import { confirmationController } from './confirmation.controller';

const router = Router();

// Public routes – no auth required
router.get('/:token', confirmationController.getOrder);
router.post('/:token', confirmationController.submitResponse);

export default router;
