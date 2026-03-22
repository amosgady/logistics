import { Response } from 'express';
import { driverService } from './driver.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const driverController = {
  getMyRoute: asyncHandler(async (req: AuthRequest, res: Response) => {
    const date = req.query.date as string | undefined;
    const result = await driverService.getMyRoute(req.user!.userId, date);
    res.json({ success: true, data: result });
  }),

  recordDelivery: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const { result, notes } = req.body;
    const delivery = await driverService.recordDelivery(
      req.user!.userId,
      orderId,
      { result, notes }
    );
    res.json({ success: true, data: delivery });
  }),

  uploadSignature: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const { signature } = req.body;
    const delivery = await driverService.uploadSignature(req.user!.userId, orderId, signature);
    res.json({ success: true, data: delivery });
  }),

  uploadPhotos: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const files = req.files as Express.Multer.File[];
    const photos = await driverService.uploadPhotos(req.user!.userId, orderId, files);
    res.json({ success: true, data: photos });
  }),

  signDeliveryNote: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const { signature } = req.body;
    const result = await driverService.signDeliveryNote(req.user!.userId, orderId, signature);
    res.json({ success: true, data: result });
  }),

  scanPallet: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { barcode, scanType } = req.body;
    const result = await driverService.scanPallet(req.user!.userId, barcode, scanType);
    res.json({ success: true, data: result });
  }),

  getLoadingStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const date = req.query.date as string | undefined;
    const result = await driverService.getLoadingStatus(req.user!.userId, date);
    res.json({ success: true, data: result });
  }),

  getUnloadingStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const result = await driverService.getUnloadingStatus(orderId);
    res.json({ success: true, data: result });
  }),
};
