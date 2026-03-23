import { Router } from 'express';
import { ivrController } from './ivr.controller';

const router = Router();

// These endpoints are PUBLIC (no auth) - Twilio calls them
router.get('/twiml/test', ivrController.testTwiml);
router.post('/twiml/test', ivrController.testTwiml);
router.post('/gather-result', ivrController.gatherResult);

export default router;
