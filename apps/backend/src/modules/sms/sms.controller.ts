import { Response } from 'express';
import { smsModuleService } from './sms.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const smsController = {
  /**
   * Send SMS for a single order.
   */
  sendOrderSms: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const targetPhone = req.body?.phone as string | undefined;
    const result = await smsModuleService.sendOrderSms(orderId, req.user!.userId, targetPhone);
    res.json({ success: true, data: result });
  }),

  /**
   * Send SMS for all orders in a route.
   */
  sendRouteSms: asyncHandler(async (req: AuthRequest, res: Response) => {
    const routeId = parseInt(req.params.routeId as string);
    const result = await smsModuleService.sendRouteSms(routeId, req.user!.userId);
    res.json({ success: true, data: result });
  }),

  /**
   * Get SMS logs.
   */
  getLogs: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = req.query.orderId ? parseInt(req.query.orderId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const result = await smsModuleService.getLogs({ orderId, limit, offset });
    res.json({ success: true, data: result });
  }),

  /**
   * Get SMS settings.
   */
  getSettings: asyncHandler(async (req: AuthRequest, res: Response) => {
    const settings = await smsModuleService.getSettings();
    res.json({ success: true, data: settings });
  }),

  /**
   * Update SMS settings.
   */
  updateSettings: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { inforuUsername, inforuPassword, apiToken, senderName, messageTemplate, isActive, confirmationMethod, replyTemplate } = req.body;
    const settings = await smsModuleService.updateSettings({
      inforuUsername,
      inforuPassword,
      apiToken,
      senderName,
      messageTemplate,
      isActive: isActive !== false,
      confirmationMethod,
      replyTemplate,
    });
    res.json({ success: true, data: settings });
  }),

  /**
   * Generate API token from 019.
   */
  generateToken: asyncHandler(async (_req: AuthRequest, res: Response) => {
    const result = await smsModuleService.generateToken();
    res.json({ success: true, data: result });
  }),

  /**
   * Send a test SMS.
   */
  sendTest: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ success: false, error: { message: 'חסר מספר טלפון' } });
      return;
    }
    const result = await smsModuleService.sendTest(phone, req.user!.userId);
    res.json({ success: true, data: result });
  }),

  /**
   * Get reminder configuration.
   */
  getReminderConfig: asyncHandler(async (_req: AuthRequest, res: Response) => {
    const config = await smsModuleService.getReminderConfig();
    res.json({ success: true, data: config });
  }),

  /**
   * Update reminder configuration.
   */
  updateReminderConfig: asyncHandler(async (req: AuthRequest, res: Response) => {
    const config = await smsModuleService.updateReminderConfig(req.body);
    res.json({ success: true, data: config });
  }),
};
