import { Response } from 'express';
import { installerService } from './installer.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const installerController = {
  getMyRoute: asyncHandler(async (req: AuthRequest, res: Response) => {
    const date = req.query.date as string | undefined;
    const result = await installerService.getMyRoute(req.user!.userId, date);
    res.json({ success: true, data: result });
  }),

  recordDelivery: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const { result, notes } = req.body;
    const delivery = await installerService.recordDelivery(
      req.user!.userId,
      orderId,
      { result, notes }
    );
    res.json({ success: true, data: delivery });
  }),

  uploadSignature: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const { signature } = req.body;
    const delivery = await installerService.uploadSignature(req.user!.userId, orderId, signature);
    res.json({ success: true, data: delivery });
  }),

  uploadPhotos: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const files = req.files as Express.Multer.File[];
    const photos = await installerService.uploadPhotos(req.user!.userId, orderId, files);
    res.json({ success: true, data: photos });
  }),
};
