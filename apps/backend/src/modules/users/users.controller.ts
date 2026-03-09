import { Request, Response } from 'express';
import { usersService } from './users.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const usersController = {
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    const users = await usersService.getAll();
    res.json({ success: true, data: users });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.create(req.body);
    res.status(201).json({ success: true, data: user });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const user = await usersService.update(id, req.body);
    res.json({ success: true, data: user });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    await usersService.delete(id);
    res.json({ success: true });
  }),
};
