import { Request, Response } from 'express';
import { planningService } from './planning.service';
import { routeOptimizerService } from './route-optimizer.service';
import { geocodingService } from '../../services/geocoding.service';
import { geoSortService } from './geo-sort.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const planningController = {
  getBoard: asyncHandler(async (req: Request, res: Response) => {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];
    const board = await planningService.getPlanningBoard(date);
    res.json({ success: true, data: board });
  }),

  assignOrderToTruck: asyncHandler(async (req: Request, res: Response) => {
    const { orderId, truckId, routeDate } = req.body;
    const result = await planningService.assignOrderToTruck(orderId, truckId, routeDate);
    res.json({ success: true, data: result });
  }),

  assignOrderToInstaller: asyncHandler(async (req: Request, res: Response) => {
    const { orderId, installerProfileId, routeDate } = req.body;
    const result = await planningService.assignOrderToInstaller(orderId, installerProfileId, routeDate);
    res.json({ success: true, data: result });
  }),

  removeOrderFromTruck: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    await planningService.removeOrderFromTruck(orderId);
    res.json({ success: true });
  }),

  reorderRoute: asyncHandler(async (req: Request, res: Response) => {
    const routeId = parseInt(req.params.routeId as string);
    const { orderIds } = req.body;
    await planningService.reorderRoute(routeId, orderIds);
    res.json({ success: true });
  }),

  assignTimeWindows: asyncHandler(async (req: Request, res: Response) => {
    const routeId = parseInt(req.params.routeId as string);
    const result = await planningService.assignTimeWindows(routeId);
    res.json({ success: true, data: result });
  }),

  optimizeRoute: asyncHandler(async (req: Request, res: Response) => {
    const routeId = parseInt(req.params.routeId as string);
    const result = await routeOptimizerService.optimizeRoute(routeId);
    res.json({ success: true, data: result });
  }),

  approveOvertime: asyncHandler(async (req: Request, res: Response) => {
    const routeId = parseInt(req.params.routeId as string);
    const result = await routeOptimizerService.approveOvertime(routeId);
    res.json({ success: true, data: result });
  }),

  geocodeOrders: asyncHandler(async (req: Request, res: Response) => {
    const { orderIds } = req.body;
    const result = await geocodingService.batchGeocodeOrders(orderIds);
    res.json({ success: true, data: result });
  }),

  sendToCoordination: asyncHandler(async (req: Request, res: Response) => {
    const routeId = parseInt(req.params.routeId as string);
    const result = await planningService.sendToCoordination(routeId);
    res.json({ success: true, data: result });
  }),

  geoSort: asyncHandler(async (req: Request, res: Response) => {
    const { orderIds } = req.body;
    const result = await geoSortService.geoSortOrders({ orderIds });
    res.json({ success: true, data: result });
  }),
};
