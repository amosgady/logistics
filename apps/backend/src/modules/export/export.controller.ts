import { Response } from 'express';
import { exportService } from './export.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const exportController = {
  sendToDriver: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { routeId } = req.body;
    const result = await exportService.sendToDriver(routeId);
    res.json({ success: true, data: result });
  }),

  unsendFromDriver: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { routeId } = req.body;
    const result = await exportService.unsendFromDriver(routeId);
    res.json({ success: true, data: result });
  }),

  unsendOrder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId } = req.body;
    const result = await exportService.unsendOrder(orderId);
    res.json({ success: true, data: result });
  }),

  exportWmsCsv: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { routeId } = req.body;
    const coordinatorName = req.body.coordinatorName || 'מתאמת';
    const result = await exportService.exportWmsCsv(routeId, coordinatorName);

    // Return CSV as file download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const encodedFilename = encodeURIComponent(result.filename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    // Add BOM for Hebrew encoding in Excel
    res.send('\uFEFF' + result.csv);
  }),

  unsendWmsExport: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId } = req.body;
    const result = await exportService.unsendWmsExport(orderId);
    res.json({ success: true, data: result });
  }),

  sendToChecker: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { routeId } = req.body;
    const result = await exportService.sendToChecker(routeId);
    res.json({ success: true, data: result });
  }),

  unsendFromChecker: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId } = req.body;
    const result = await exportService.unsendFromChecker(orderId);
    res.json({ success: true, data: result });
  }),
};
