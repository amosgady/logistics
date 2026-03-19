import { Request, Response } from 'express';
import { settingsService } from './settings.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const settingsController = {
  getDepartmentSettings: asyncHandler(async (_req: Request, res: Response) => {
    const settings = await settingsService.getDepartmentSettings();
    res.json({ success: true, data: settings });
  }),

  updateDepartmentSettings: asyncHandler(async (req: Request, res: Response) => {
    const { settings } = req.body;
    const updated = await settingsService.updateDepartmentSettings(settings);
    res.json({ success: true, data: updated });
  }),

  getTruckColors: asyncHandler(async (_req: Request, res: Response) => {
    const colors = await settingsService.getTruckColors();
    res.json({ success: true, data: colors });
  }),

  updateTruckColors: asyncHandler(async (req: Request, res: Response) => {
    const { colors } = req.body;
    const updated = await settingsService.updateTruckColors(colors);
    res.json({ success: true, data: updated });
  }),

  getTruckSizes: asyncHandler(async (_req: Request, res: Response) => {
    const sizes = await settingsService.getTruckSizes();
    res.json({ success: true, data: sizes });
  }),

  updateTruckSizes: asyncHandler(async (req: Request, res: Response) => {
    const { sizes } = req.body;
    const updated = await settingsService.updateTruckSizes(sizes);
    res.json({ success: true, data: updated });
  }),

  getTruckTypes: asyncHandler(async (_req: Request, res: Response) => {
    const types = await settingsService.getTruckTypes();
    res.json({ success: true, data: types });
  }),

  updateTruckTypes: asyncHandler(async (req: Request, res: Response) => {
    const { types } = req.body;
    const updated = await settingsService.updateTruckTypes(types);
    res.json({ success: true, data: updated });
  }),
};
