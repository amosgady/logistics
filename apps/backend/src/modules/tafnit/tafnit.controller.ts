import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../utils/prisma';
import {
  importOrderFromJson,
  getLogs,
  freezeOrder,
  getFrozenOrders,
  getPendingUpdates,
  approvePendingUpdate,
  rejectPendingUpdate,
} from './tafnit.service';

async function resolveUserName(req: AuthRequest): Promise<string | undefined> {
  if (!req.user?.userId) return undefined;
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { fullName: true, email: true },
  });
  return user?.fullName || user?.email || String(req.user.userId);
}

export const tafnitController = {
  importOrder: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ success: false, error: 'JSON body required' });
      return;
    }
    const ip = (req.ip || '').replace(/^::ffff:/, '');
    const result = await importOrderFromJson(body, ip);
    res.json({ success: true, data: result });
  }),

  getLogs: asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const logs = await getLogs(limit);
    res.json({ success: true, data: logs });
  }),

  freezeOrder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderNumber } = req.body as { orderNumber?: string };
    if (!orderNumber) {
      res.status(400).json({ success: false, error: 'orderNumber required' });
      return;
    }
    // Resolve user's full name for the audit record
    let frozenBy: string | undefined;
    if (req.user?.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { fullName: true, email: true } });
      frozenBy = user?.fullName || user?.email || String(req.user.userId);
    }
    const result = await freezeOrder(orderNumber, frozenBy);
    if (!result.success) {
      res.status(502).json({ success: false, error: result.error, raw: result.raw });
      return;
    }
    res.json({ success: true, raw: result.raw });
  }),

  getFrozenOrders: asyncHandler(async (_req: Request, res: Response) => {
    const orders = await getFrozenOrders();
    res.json({ success: true, data: orders });
  }),

  getPendingUpdates: asyncHandler(async (_req: Request, res: Response) => {
    const updates = await getPendingUpdates();
    res.json({ success: true, data: updates });
  }),

  approvePendingUpdate: asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'invalid id' });
      return;
    }
    const reviewedBy = await resolveUserName(req);
    const result = await approvePendingUpdate(id, reviewedBy);
    res.json({ success: true, data: result });
  }),

  rejectPendingUpdate: asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'invalid id' });
      return;
    }
    const reviewedBy = await resolveUserName(req);
    const result = await rejectPendingUpdate(id, reviewedBy);
    res.json({ success: true, data: result });
  }),
};
