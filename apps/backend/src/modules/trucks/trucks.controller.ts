import { Request, Response } from 'express';
import { trucksService } from './trucks.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const trucksController = {
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    const trucks = await trucksService.getAll();
    res.json({ success: true, data: trucks });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const truck = await trucksService.getById(parseInt(req.params.id as string));
    res.json({ success: true, data: truck });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const truck = await trucksService.create(req.body);
    res.status(201).json({ success: true, data: truck });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const truck = await trucksService.update(parseInt(req.params.id as string), req.body);
    res.json({ success: true, data: truck });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await trucksService.delete(parseInt(req.params.id as string));
    res.json({ success: true });
  }),

  getTruckLoad: asyncHandler(async (req: Request, res: Response) => {
    const truckId = parseInt(req.params.id as string);
    const routeDate = req.query.routeDate as string;
    const load = await trucksService.getTruckLoad(truckId, routeDate);
    res.json({ success: true, data: load });
  }),
};
