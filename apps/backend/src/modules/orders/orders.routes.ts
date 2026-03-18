import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { ordersController } from './orders.controller';
import { authMiddleware, requireRole } from '../../middleware/auth';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// PDF upload storage for delivery notes
const pdfStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', '..', 'uploads', 'delivery-notes'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `dn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('רק קבצי PDF מותרים'));
  },
});

const router = Router();

router.use(authMiddleware);

router.get('/', requireRole('COORDINATOR', 'ADMIN'), ordersController.getOrders);
router.get('/:id', ordersController.getOrderById);
router.post('/import', requireRole('COORDINATOR', 'ADMIN'), upload.single('file'), ordersController.importCsv);
router.post('/import/analyze', requireRole('COORDINATOR', 'ADMIN'), upload.single('file'), ordersController.analyzeCsvImport);
router.patch('/:id/status', requireRole('COORDINATOR', 'ADMIN'), ordersController.changeStatus);
router.post('/bulk-status', requireRole('COORDINATOR', 'ADMIN'), ordersController.bulkChangeStatus);
router.post('/bulk-delete', requireRole('COORDINATOR', 'ADMIN'), ordersController.bulkDelete);
router.post('/bulk-delivery-date', requireRole('COORDINATOR', 'ADMIN'), ordersController.bulkUpdateDeliveryDate);
router.patch('/lines/:lineId/quantity', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateLineQuantity);
router.delete('/lines/:lineId', requireRole('COORDINATOR', 'ADMIN'), ordersController.deleteOrderLine);
router.delete('/:id', requireRole('COORDINATOR', 'ADMIN'), ordersController.deleteOrder);
router.patch('/:id/delivery-date', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateDeliveryDate);
router.patch('/:id/zone', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateZone);
router.patch('/:id/coordination', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateCoordination);
router.patch('/:id/pallet-count', requireRole('COORDINATOR', 'ADMIN'), ordersController.updatePalletCount);
router.patch('/:id/address', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateAddress);
router.patch('/:id/city', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateCity);
router.patch('/:id/driver-note', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateDriverNote);
router.patch('/:id/door-count', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateDoorCount);
router.patch('/:id/handle-count', requireRole('COORDINATOR', 'ADMIN'), ordersController.updateHandleCount);
router.post('/:id/delivery-note', requireRole('COORDINATOR', 'ADMIN'), uploadPdf.single('file'), ordersController.uploadDeliveryNote);
router.delete('/:id/delivery-note', requireRole('COORDINATOR', 'ADMIN'), ordersController.deleteDeliveryNote);

export default router;
