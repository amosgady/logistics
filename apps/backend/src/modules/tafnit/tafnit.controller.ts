import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { importOrderFromJson, getLogs } from './tafnit.service';

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
};
