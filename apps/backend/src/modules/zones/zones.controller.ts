import { Request, Response } from 'express';
import { zonesService } from './zones.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const zonesController = {
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    const zones = await zonesService.getAll();
    res.json({ success: true, data: zones });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const zone = await zonesService.getById(parseInt(req.params.id as string));
    res.json({ success: true, data: zone });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const zone = await zonesService.create(req.body);
    res.status(201).json({ success: true, data: zone });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const zone = await zonesService.update(parseInt(req.params.id as string), req.body);
    res.json({ success: true, data: zone });
  }),

  addCities: asyncHandler(async (req: Request, res: Response) => {
    const result = await zonesService.addCities(parseInt(req.params.id as string), req.body.cities);
    res.json({ success: true, data: result });
  }),

  removeCity: asyncHandler(async (req: Request, res: Response) => {
    await zonesService.removeCity(parseInt(req.params.cityId as string));
    res.json({ success: true });
  }),

  assignZones: asyncHandler(async (req: Request, res: Response) => {
    const { orderIds } = req.body;
    const result = await zonesService.assignZonesToOrders(orderIds);
    res.json({ success: true, data: result });
  }),
};
