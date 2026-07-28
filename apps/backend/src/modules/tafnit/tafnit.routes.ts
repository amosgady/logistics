import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import iconv from 'iconv-lite';
import { requireTafnitIp } from '../../middleware/tafnitIp';
import { tafnitController } from './tafnit.controller';

const router = Router();

router.use(requireTafnitIp);

router.use(express.raw({ type: '*/*', limit: '10mb' }), (req: Request, _res: Response, next: NextFunction) => {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    try {
      const utf8 = iconv.decode(req.body, 'windows-1255');
      req.body = JSON.parse(utf8);
    } catch {
      req.body = {};
    }
  }
  next();
});

router.post('/orders', tafnitController.importOrder);

export default router;
