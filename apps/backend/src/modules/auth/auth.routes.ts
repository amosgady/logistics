import { Router } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/login', authController.login);
router.post('/verify-2fa', authController.verifyTwoFactor);
router.post('/resend-2fa', authController.resendTwoFactorCode);
router.post('/refresh', authController.refresh);
router.get('/me', authMiddleware, authController.me);
router.post('/toggle-2fa', authMiddleware, authController.toggleTwoFactor);
router.get('/2fa-status', authMiddleware, authController.getTwoFactorStatus);

export default router;
