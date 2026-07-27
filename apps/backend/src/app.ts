import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import ivrRoutes from './modules/ivr/ivr.routes';
import checkerRoutes from './modules/checker/checker.routes';
import whatsappRoutes from './modules/whatsapp/whatsapp.routes';
import whatsappWebhookRoutes from './modules/whatsapp-webhook/whatsapp-webhook.routes';
import tafnitRoutes from './modules/tafnit/tafnit.routes';

const app = express();

// Trust reverse proxy (Nginx) – required for correct IP and protocol detection
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: false, // Frontend handles its own CSP
}));

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'יותר מדי ניסיונות כניסה, נסה שוב בעוד 15 דקות' },
  standardHeaders: true,
  legacyHeaders: false,
});

const smsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: { error: 'חריגה ממגבלת שליחת SMS' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://log.perfectlinesite.com']
    : ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', apiLimiter);

// Protected static files – require valid JWT
app.use('/uploads', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string);
  if (!token) {
    res.status(401).json({ error: 'נדרשת הזדהות' });
    return;
  }
  try {
    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET || '');
    next();
  } catch {
    res.status(401).json({ error: 'טוקן לא תקין' });
  }
});
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Tafnit ERP integration (API-key auth, no JWT)
app.use('/api/v1/tafnit', tafnitRoutes);

// Public routes (no auth)
app.use('/api/v1/confirm', confirmRoutes);
app.use('/api/v1/sms-webhook', smsWebhookRoutes);
app.use('/api/v1/ivr', ivrRoutes);
app.use('/api/v1/whatsapp-webhook', whatsappWebhookRoutes);

// Routes
app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/verify-2fa', loginLimiter);
app.use('/api/v1/sms', smsLimiter);
app.use('/api/v1/whatsapp', smsLimiter);
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
app.use('/api/v1/checker', checkerRoutes);
app.use('/api/v1/whatsapp', whatsappRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
