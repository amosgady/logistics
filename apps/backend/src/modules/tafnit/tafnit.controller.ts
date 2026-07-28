import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { importOrderFromJson } from './tafnit.service';

export const tafnitController = {
  importOrder: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ success: false, error: 'JSON body required' });
      return;
    }
    const result = await importOrderFromJson(body);
    res.json({ success: true, data: result });
  }),
};
