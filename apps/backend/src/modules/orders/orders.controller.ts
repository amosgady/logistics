import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ordersService } from './orders.service';
import { csvImportService } from './csv-import.service';
import { geocodingService } from '../../services/geocoding.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../middleware/errorHandler';
import prisma from '../../utils/prisma';

export const ordersController = {
  getOrders: asyncHandler(async (req: AuthRequest, res: Response) => {
    const authUser = req.user!;
    const statusParam = req.query.status as string | undefined;
    const departmentParam = req.query.department as string | undefined;

    const filters: Record<string, any> = {
      status: statusParam ? statusParam.split(',') : undefined,
      zoneId: req.query.zoneId ? parseInt(req.query.zoneId as string) : undefined,
      deliveryDateFrom: req.query.deliveryDateFrom as string,
      deliveryDateTo: req.query.deliveryDateTo as string,
      search: req.query.search as string,
      department: departmentParam ? departmentParam.split(',') : undefined,
      sentToWms: req.query.sentToWms === 'true' ? true : undefined,
      sentToChecker: req.query.sentToChecker === 'true' ? true : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
    };

    // Enforce department scoping for non-ADMIN users
    if (authUser.role !== 'ADMIN' && authUser.department) {
      filters.department = [authUser.department];
    }
    // Enforce zone scoping for non-ADMIN users
    if (authUser.role !== 'ADMIN' && authUser.zoneIds && authUser.zoneIds.length > 0) {
      filters.userZoneIds = authUser.zoneIds;
    }

    const result = await ordersService.getOrders(filters);
    res.json({ success: true, data: result.orders, meta: result.meta });
  }),

  getAllOrderIds: asyncHandler(async (req: AuthRequest, res: Response) => {
    const authUser = req.user!;
    const statusParam = req.query.status as string | undefined;
    const departmentParam = req.query.department as string | undefined;

    const filters: Record<string, any> = {
      status: statusParam ? statusParam.split(',') : undefined,
      zoneId: req.query.zoneId ? parseInt(req.query.zoneId as string) : undefined,
      deliveryDateFrom: req.query.deliveryDateFrom as string,
      deliveryDateTo: req.query.deliveryDateTo as string,
      search: req.query.search as string,
      department: departmentParam ? departmentParam.split(',') : undefined,
      sentToWms: req.query.sentToWms === 'true' ? true : undefined,
      sentToChecker: req.query.sentToChecker === 'true' ? true : undefined,
    };

    if (authUser.role !== 'ADMIN' && authUser.department) {
      filters.department = [authUser.department];
    }
    if (authUser.role !== 'ADMIN' && authUser.zoneIds && authUser.zoneIds.length > 0) {
      filters.userZoneIds = authUser.zoneIds;
    }

    const ids = await ordersService.getAllOrderIds(filters);
    res.json({ success: true, data: ids });
  }),

  getOrderById: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const order = await ordersService.getOrderById(id);
    res.json({ success: true, data: order });
  }),

  importCsv: asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new AppError(400, 'NO_FILE', 'לא הועלה קובץ');
    }

    const csvContent = req.file.buffer.toString('utf-8');

    // Check if decisions were sent (for conflict resolution)
    let decisions;
    if (req.body.decisions) {
      try {
        decisions = typeof req.body.decisions === 'string'
          ? JSON.parse(req.body.decisions)
          : req.body.decisions;
      } catch {
        throw new AppError(400, 'INVALID_DECISIONS', 'פורמט החלטות לא תקין');
      }
    }

    const result = await csvImportService.importCsv(csvContent, decisions);
    res.json({ success: true, data: result });
  }),

  analyzeCsvImport: asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new AppError(400, 'NO_FILE', 'לא הועלה קובץ');
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const result = await csvImportService.analyzeCsv(csvContent);
    res.json({ success: true, data: result });
  }),

  changeStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    const { status, reason } = req.body;
    const order = await ordersService.changeStatus(id, status, req.user!.userId, reason);
    res.json({ success: true, data: order });
  }),

  bulkChangeStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderIds, targetStatus } = req.body;
    const result = await ordersService.bulkChangeStatus(orderIds, targetStatus, req.user!.userId);
    res.json({ success: true, data: result });
  }),

  bulkUpdateDeliveryDate: asyncHandler(async (req: Request, res: Response) => {
    const { orderIds, deliveryDate } = req.body;
    const result = await ordersService.bulkUpdateDeliveryDate(orderIds, deliveryDate);
    res.json({ success: true, data: result });
  }),

  updateDeliveryDate: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const { deliveryDate } = req.body;
    const order = await ordersService.updateDeliveryDate(id, deliveryDate);
    res.json({ success: true, data: order });
  }),

  updatePrice: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const { price } = req.body;
    const order = await ordersService.updatePrice(id, price);
    res.json({ success: true, data: order });
  }),

  updateDepartment: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const { department } = req.body;
    const order = await ordersService.updateDepartment(id, department);
    res.json({ success: true, data: order });
  }),

  updateZone: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const { zoneId } = req.body;
    const order = await ordersService.updateZone(id, zoneId);
    res.json({ success: true, data: order });
  }),

  validateAddresses: asyncHandler(async (req: Request, res: Response) => {
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'יש לבחור הזמנות לאימות');
    }
    // Reset geocode data so batchGeocodeOrders will re-process
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { latitude: null, longitude: null, geocodeValid: null, geocodedAddress: null },
    });
    const results = await geocodingService.batchGeocodeOrders(orderIds);
    res.json({ success: true, data: results });
  }),

  deleteOrder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    const result = await ordersService.deleteOrder(id);
    res.json({ success: true, data: result });
  }),

  bulkDelete: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderIds } = req.body;
    const result = await ordersService.bulkDelete(orderIds);
    res.json({ success: true, data: result });
  }),

  updateCoordination: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const order = await ordersService.updateCoordination(id, req.body);
    res.json({ success: true, data: order });
  }),

  updatePalletCount: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);
    const { palletCount } = req.body;
    const order = await ordersService.updatePalletCount(orderId, palletCount);
    res.json({ success: true, data: order });
  }),

  updateAddress: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);
    const { address } = req.body;
    const order = await ordersService.updateAddress(orderId, address);
    res.json({ success: true, data: order });
  }),

  updateCity: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);
    const { city } = req.body;
    const order = await ordersService.updateCity(orderId, city);
    res.json({ success: true, data: order });
  }),

  uploadDeliveryNote: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);
    if (!req.file) {
      throw new AppError(400, 'NO_FILE', 'לא הועלה קובץ');
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    // Delete old file if exists
    if (order.deliveryNoteUrl) {
      const oldPath = path.join(__dirname, '..', '..', '..', order.deliveryNoteUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const deliveryNoteUrl = `/uploads/delivery-notes/${req.file.filename}`;
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { deliveryNoteUrl },
    });

    res.json({ success: true, data: { deliveryNoteUrl: updated.deliveryNoteUrl } });
  }),

  deleteDeliveryNote: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    if (order.deliveryNoteUrl) {
      const filePath = path.join(__dirname, '..', '..', '..', order.deliveryNoteUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryNoteUrl: null },
    });

    res.json({ success: true });
  }),

  updateDriverNote: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);
    const { driverNote } = req.body;
    const order = await ordersService.updateDriverNote(orderId, driverNote ?? null);
    res.json({ success: true, data: order });
  }),

  updateDoorCount: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);
    const { doorCount } = req.body;
    const order = await ordersService.updateDoorCount(orderId, doorCount ?? null);
    res.json({ success: true, data: order });
  }),

  updateHandleCount: asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string);
    const { handleCount } = req.body;
    const order = await ordersService.updateHandleCount(orderId, handleCount ?? null);
    res.json({ success: true, data: order });
  }),

  updateLineQuantity: asyncHandler(async (req: Request, res: Response) => {
    const lineId = parseInt(req.params.lineId as string);
    const { quantity } = req.body;
    const line = await ordersService.updateLineQuantity(lineId, quantity);
    res.json({ success: true, data: line });
  }),

  deleteOrderLine: asyncHandler(async (req: Request, res: Response) => {
    const lineId = parseInt(req.params.lineId as string);
    const result = await ordersService.deleteOrderLine(lineId);
    res.json({ success: true, data: result });
  }),
};
