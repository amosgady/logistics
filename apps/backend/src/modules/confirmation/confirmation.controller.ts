import { Request, Response } from 'express';
import { confirmationService } from './confirmation.service';
import { asyncHandler } from '../../utils/asyncHandler';

export const confirmationController = {
  /**
   * Get order details by token (public).
   */
  getOrder: asyncHandler(async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const order = await confirmationService.getOrderByToken(token);
    res.json({ success: true, data: order });
  }),

  /**
   * Submit customer response (public).
   */
  submitResponse: asyncHandler(async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const { response, notes } = req.body;

    if (!response || !['CONFIRMED', 'DECLINED'].includes(response)) {
      res.status(400).json({ success: false, error: { message: 'תגובה לא תקינה' } });
      return;
    }

    const result = await confirmationService.submitResponse(token, response, notes);
    res.json({ success: true, data: result });
  }),
};
