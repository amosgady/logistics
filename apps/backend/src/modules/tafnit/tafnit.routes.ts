import { Router } from 'express';
import { requireTafnitIp } from '../../middleware/tafnitIp';
import { tafnitController } from './tafnit.controller';

const router = Router();

router.use(requireTafnitIp);

router.post('/orders', tafnitController.importOrder);

export default router;
