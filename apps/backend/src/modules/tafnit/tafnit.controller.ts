import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { importOrderFromJson, getLogs, freezeOrder } from './tafnit.service';

export const tafnitController = {
  importOrder: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ success: false, error: 'JSON body required' });
      return;
    }
    const ip = (req.ip || '').replace(/^::ffff:/, '');
    const result = await importOrderFromJson(body, ip);
    res.json({ success: true, data: result });
  }),

  getLogs: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const logs = await getLogs(limit);
    res.json({ success: true, data: logs });
  }),

  freezeOrder: asyncHandler(async (req: Request, res: Response) => {
    const { orderNumber } = req.body as { orderNumber?: string };
    if (!orderNumber) {
      res.status(400).json({ success: false, error: 'orderNumber required' });
      return;
    }
    const result = await freezeOrder(orderNumber);
    if (!result.success) {
      res.status(502).json({ success: false, error: result.error, raw: result.raw });
      return;
    }
    res.json({ success: true, raw: result.raw });
  }),
};
