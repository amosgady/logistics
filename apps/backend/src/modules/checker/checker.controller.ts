import { Response } from 'express';
import { checkerService } from './checker.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const checkerController = {
  searchOrders: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { q, status, date } = req.query;
    const orders = await checkerService.searchOrders({
      search: q as string,
      inspectionStatus: (status as 'all' | 'checked' | 'unchecked') || 'all',
      date: date as string,
    });
    res.json({ success: true, data: orders });
  }),

  getOrderLines: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const order = await checkerService.getOrderLines(orderId);
    res.json({ success: true, data: order });
  }),

  toggleLineCheck: asyncHandler(async (req: AuthRequest, res: Response) => {
    const lineId = parseInt(req.params.lineId as string);
    const { checked } = req.body;
    const result = await checkerService.toggleLineCheck(lineId, checked);
    res.json({ success: true, data: result });
  }),
};
