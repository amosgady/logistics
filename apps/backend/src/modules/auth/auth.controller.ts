import { Response } from 'express';
import { authService } from './auth.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

export const authController = {
  login: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.json({ success: true, data: result });
  }),

  verifyTwoFactor: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { tempToken, code } = req.body;
    const result = await authService.verifyTwoFactor(tempToken, code);
    res.json({ success: true, data: result });
  }),

  resendTwoFactorCode: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { tempToken } = req.body;
    const result = await authService.resendTwoFactorCode(tempToken);
    res.json({ success: true, data: result });
  }),

  toggleTwoFactor: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.toggleTwoFactor(req.user!.userId);
    res.json({ success: true, data: result });
  }),

  getTwoFactorStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.getTwoFactorStatus(req.user!.userId);
    res.json({ success: true, data: result });
  }),

  refresh: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    res.json({ success: true, data: result });
  }),

  me: asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await authService.getProfile(req.user!.userId);
    res.json({ success: true, data: user });
  }),
};
