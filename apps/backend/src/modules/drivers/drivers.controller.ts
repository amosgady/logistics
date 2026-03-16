import { Request, Response } from 'express';
import { driversService } from './drivers.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const driversController = {
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    const drivers = await driversService.getAll();
    res.json({ success: true, data: drivers });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const driver = await driversService.create(req.body);
    res.status(201).json({ success: true, data: driver });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const driver = await driversService.update(id, req.body);
    res.json({ success: true, data: driver });
  }),

  deactivate: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    await driversService.deactivate(id);
    res.json({ success: true });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    await driversService.delete(id);
    res.json({ success: true });
  }),
};
