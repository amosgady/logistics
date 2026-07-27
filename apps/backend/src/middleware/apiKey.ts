import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key'];
  if (!key || key !== env.TAFNIT_API_KEY) {
    res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    return;
  }
  next();
}
