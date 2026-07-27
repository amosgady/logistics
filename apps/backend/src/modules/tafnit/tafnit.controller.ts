import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { importOrdersFromXml } from './tafnit.service';

export const tafnitController = {
  importOrders: asyncHandler(async (req: Request, res: Response) => {
    const xml = req.body as string;
    if (!xml || typeof xml !== 'string' || !xml.trim()) {
      res.status(400).json({ success: false, error: 'XML body is required' });
      return;
    }
    const result = await importOrdersFromXml(xml);
    res.json({ success: true, data: result });
  }),
};
