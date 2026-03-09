import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { smsController } from './sms.controller';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN', 'COORDINATOR'));

// Send SMS for single order
router.post('/send/order/:orderId', smsController.sendOrderSms);

// Send SMS for all orders in a route
router.post('/send/route/:routeId', smsController.sendRouteSms);

// Test SMS
router.post('/test', smsController.sendTest);

// SMS logs
router.get('/logs', smsController.getLogs);

// Settings (admin only)
router.get('/settings', smsController.getSettings);
router.put('/settings', smsController.updateSettings);

// Generate API token
router.post('/generate-token', smsController.generateToken);

// Reminder config
router.get('/reminders', smsController.getReminderConfig);
router.put('/reminders', smsController.updateReminderConfig);

export default router;
