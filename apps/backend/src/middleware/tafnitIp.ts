import { Request, Response, NextFunction } from 'express';

// Allowed source IPs for inbound Tafnit pushes. Configurable via
// TAFNIT_ALLOWED_IPS (comma-separated) so the on-prem deployment can add
// Tafnit's direct/internal source IP without a code change. Defaults to the
// public IP used when orders arrive via the cloud edge.
const ALLOWED_IPS = (process.env.TAFNIT_ALLOWED_IPS || '147.235.45.98')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function requireTafnitIp(req: Request, res: Response, next: NextFunction) {
  const raw = req.ip || req.socket.remoteAddress || '';
  const ip = raw.replace(/^::ffff:/, '');
  if (!ALLOWED_IPS.includes(ip)) {
    // Log the rejected source so a new (e.g. direct/internal) Tafnit IP can be
    // identified and added to TAFNIT_ALLOWED_IPS.
    console.warn(`[tafnitIp] rejected inbound from ip=${ip} (allowed: ${ALLOWED_IPS.join(', ')})`);
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}
