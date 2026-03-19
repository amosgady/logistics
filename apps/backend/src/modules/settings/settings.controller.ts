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
};
