import { Request, Response, NextFunction } from 'express';

const ALLOWED_IPS = ['147.235.45.98'];

export function requireTafnitIp(req: Request, res: Response, next: NextFunction) {
  const raw = req.ip || req.socket.remoteAddress || '';
  const ip = raw.replace(/^::ffff:/, '');
  if (!ALLOWED_IPS.includes(ip)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}
