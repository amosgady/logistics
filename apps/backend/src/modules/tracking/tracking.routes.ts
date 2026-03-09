import { Router } from 'express';
import { trackingController } from './tracking.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Admin/Coordinator endpoints
router.get('/board', requireRole('ADMIN', 'COORDINATOR'), trackingController.getTrackingBoard);
router.post('/messages', requireRole('ADMIN', 'COORDINATOR'), trackingController.sendMessage);

// Field worker endpoints
router.post('/location', requireRole('DRIVER', 'INSTALLER'), trackingController.reportLocation);
router.get('/my-messages', requireRole('DRIVER', 'INSTALLER'), trackingController.getMyMessages);
router.get('/my-messages/unread-count', requireRole('DRIVER', 'INSTALLER'), trackingController.getUnreadCount);
router.patch('/messages/:messageId/read', requireRole('DRIVER', 'INSTALLER'), trackingController.markMessageRead);

export default router;
