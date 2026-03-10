import express from 'express';
import path from 'path';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import ordersRoutes from './modules/orders/orders.routes';
import zonesRoutes from './modules/zones/zones.routes';
import trucksRoutes from './modules/trucks/trucks.routes';
import planningRoutes from './modules/planning/planning.routes';
import exportRoutes from './modules/export/export.routes';
import driverRoutes from './modules/driver/driver.routes';
import usersRoutes from './modules/users/users.routes';
import driversRoutes from './modules/drivers/drivers.routes';
import installersRoutes from './modules/installers/installers.routes';
import installerFieldRoutes from './modules/installer/installer.routes';
import settingsRoutes from './modules/settings/settings.routes';
import smsRoutes from './modules/sms/sms.routes';
import trackingRoutes from './modules/tracking/tracking.routes';
import confirmRoutes from './modules/confirmation/confirmation.routes';
import smsWebhookRoutes from './modules/sms-webhook/sms-webhook.routes';

const app = express();

// Trust reverse proxy (Nginx) – required for correct IP and protocol detection
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Public routes (no auth)
app.use('/api/v1/confirm', confirmRoutes);
app.use('/api/v1/sms-webhook', smsWebhookRoutes);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/zones', zonesRoutes);
app.use('/api/v1/trucks', trucksRoutes);
app.use('/api/v1/planning', planningRoutes);
app.use('/api/v1/coordination', exportRoutes);
app.use('/api/v1/driver', driverRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/drivers', driversRoutes);
app.use('/api/v1/installers', installersRoutes);
app.use('/api/v1/installer', installerFieldRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/sms', smsRoutes);
app.use('/api/v1/tracking', trackingRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
