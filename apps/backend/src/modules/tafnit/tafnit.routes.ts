import { Router } from 'express';
import express from 'express';
import { requireApiKey } from '../../middleware/apiKey';
import { tafnitController } from './tafnit.controller';

const router = Router();

// Parse XML body as raw string for this module
router.use(express.text({ type: ['application/xml', 'text/xml', 'text/plain', '*/*'] }));

router.use(requireApiKey);

router.post('/orders', tafnitController.importOrders);

export default router;
