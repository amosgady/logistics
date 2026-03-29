import { Response } from 'express';
import { whatsappModuleService } from './whatsapp.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const whatsappController = {
  sendOrderWhatsapp: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const targetPhone = req.body?.phone as string | undefined;
    const result = await whatsappModuleService.sendOrderWhatsapp(orderId, req.user!.userId, targetPhone);
    res.json({ success: true, data: result });
  }),

  sendRouteWhatsapp: asyncHandler(async (req: AuthRequest, res: Response) => {
    const routeId = parseInt(req.params.routeId as string);
    const result = await whatsappModuleService.sendRouteWhatsapp(routeId, req.user!.userId);
    res.json({ success: true, data: result });
  }),
};
