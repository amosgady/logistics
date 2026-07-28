import { Router } from 'express';
import { requireApiKey } from '../../middleware/apiKey';
import { tafnitController } from './tafnit.controller';

const router = Router();

router.use(requireApiKey);

router.post('/orders', tafnitController.importOrder);

export default router;
