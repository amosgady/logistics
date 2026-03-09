import { Request, Response } from 'express';
import { installersService } from './installers.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const installersController = {
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    const installers = await installersService.getAll();
    res.json({ success: true, data: installers });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const installer = await installersService.create(req.body);
    res.status(201).json({ success: true, data: installer });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const installer = await installersService.update(id, req.body);
    res.json({ success: true, data: installer });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    await installersService.delete(id);
    res.json({ success: true });
  }),
};
