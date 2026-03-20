import { Response } from 'express';
import { trackingService } from './tracking.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const trackingController = {
  getTrackingBoard: asyncHandler(async (req: AuthRequest, res: Response) => {
    const date = req.query.date as string;
    const userDept = req.user?.role === 'ADMIN' ? null : req.user?.department || null;
    const userZoneIds = req.user?.role === 'ADMIN' ? undefined : req.user?.zoneIds;
    const result = await trackingService.getTrackingBoard(date, userDept, userZoneIds);
    res.json({ success: true, data: result });
  }),

  reportLocation: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { latitude, longitude } = req.body;
    await trackingService.reportLocation(req.user!.userId, latitude, longitude);
    res.json({ success: true });
  }),

  sendMessage: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { recipientId, text } = req.body;
    const message = await trackingService.sendMessage(req.user!.userId, recipientId, text);
    res.json({ success: true, data: message });
  }),

  getMyMessages: asyncHandler(async (req: AuthRequest, res: Response) => {
    const messages = await trackingService.getMyMessages(req.user!.userId);
    res.json({ success: true, data: messages });
  }),

  markMessageRead: asyncHandler(async (req: AuthRequest, res: Response) => {
    const messageId = parseInt(req.params.messageId as string);
    await trackingService.markMessageRead(req.user!.userId, messageId);
    res.json({ success: true });
  }),

  getUnreadCount: asyncHandler(async (req: AuthRequest, res: Response) => {
    const count = await trackingService.getUnreadCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  }),
};
