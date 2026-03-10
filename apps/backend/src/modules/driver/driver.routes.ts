import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { driverController } from './driver.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const router = Router();

const photoStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', '..', 'uploads', 'photos'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const uploadPhotos = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('רק קבצי תמונה מותרים'));
  },
});

router.use(authMiddleware);
router.use(requireRole('DRIVER'));

router.get('/my-route', driverController.getMyRoute);
router.post('/orders/:orderId/delivery', driverController.recordDelivery);
router.post('/orders/:orderId/signature', driverController.uploadSignature);
router.post('/orders/:orderId/photos', uploadPhotos.array('photos', 5), driverController.uploadPhotos);
router.post('/orders/:orderId/sign-delivery-note', driverController.signDeliveryNote);

export default router;
