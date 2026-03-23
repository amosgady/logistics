import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ivrService } from './ivr.service';
import prisma from '../../utils/prisma';
import { env } from '../../config/env';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const IVR_DIR = path.join(__dirname, '../../../uploads/ivr');
const GENERATED_DIR = path.join(IVR_DIR, 'generated');
const BASE = env.BASE_URL || 'https://log.perfectlinesite.com';

export const ivrController = {
  /**
   * Initiate an IVR call for an order.
   */
  callOrder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const targetPhone = req.body?.phone as string | undefined;
    const result = await ivrService.callOrder(orderId, req.user!.userId, targetPhone);
    res.json({ success: true, data: result });
  }),

  /**
   * TwiML endpoint for order confirmation call.
   * Twilio fetches this URL when the call is answered.
   * Uses pre-recorded audio files combined into one MP3.
   */
  orderTwiml: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, deliveryDate: true, timeWindow: true },
    });

    if (!order) {
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      return;
    }

    // Generate combined audio
    const audioUrl = generateCombinedAudio(order);

    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather numDigits="1" timeout="10" action="${BASE}/api/v1/ivr/gather/${orderId}" method="POST">
    <Play>${BASE}/uploads/ivr/confirm_prompt.mp3</Play>
  </Gather>
  <Play>${BASE}/uploads/ivr/no_response.mp3</Play>
</Response>`);
  },

  /**
   * Handle DTMF gather result and update order coordination status.
   */
  gatherOrder: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const digits = req.body?.Digits || req.query?.Digits;

    console.log(`[IVR] Order ${orderId}, pressed: ${digits}`);

    res.type('text/xml');

    if (digits === '1') {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            customerResponse: 'CONFIRMED',
            coordinationStatus: 'COORDINATED',
            respondedAt: new Date(),
            customerNotes: 'אושר בשיחת IVR',
          },
        });
        console.log(`[IVR] Order ${orderId} CONFIRMED via IVR`);
      } catch (err: any) {
        console.error(`[IVR] Error updating order ${orderId}:`, err.message);
      }

      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Play>${BASE}/uploads/ivr/confirmed.mp3</Play></Response>`);
    } else if (digits === '2') {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            customerResponse: 'DECLINED',
            respondedAt: new Date(),
            customerNotes: 'סורב בשיחת IVR',
          },
        });
        console.log(`[IVR] Order ${orderId} DECLINED via IVR`);
      } catch (err: any) {
        console.error(`[IVR] Error updating order ${orderId}:`, err.message);
      }

      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Play>${BASE}/uploads/ivr/declined.mp3</Play></Response>`);
    } else {
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${BASE}/uploads/ivr/invalid.mp3</Play>
  <Gather numDigits="1" timeout="10" action="${BASE}/api/v1/ivr/gather/${orderId}" method="POST">
    <Play>${BASE}/uploads/ivr/confirm_prompt.mp3</Play>
  </Gather>
  <Play>${BASE}/uploads/ivr/no_response.mp3</Play>
</Response>`);
    }
  },

  /**
   * Handle call status callback.
   */
  statusCallback: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const callStatus = req.body?.CallStatus || '';

    if (['no-answer', 'busy', 'failed', 'canceled'].includes(callStatus)) {
      console.log(`[IVR Status] Order ${orderId}: ${callStatus}`);
      const statusMap: Record<string, string> = {
        'no-answer': 'לא ענה',
        'busy': 'תפוס',
        'failed': 'נכשל',
        'canceled': 'בוטל',
      };
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: { customerNotes: `שיחת IVR: ${statusMap[callStatus] || callStatus}` },
        });
      } catch { /* ignore */ }
    }

    res.status(200).send('OK');
  },
};

/**
 * Generate a combined audio file for this order's date and time window.
 */
function generateCombinedAudio(order: { id: number; deliveryDate: Date | null; timeWindow: string | null }): string {
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  const date = order.deliveryDate ? new Date(order.deliveryDate) : new Date();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const timeFile = order.timeWindow === 'AFTERNOON' ? 'time_afternoon' : 'time_morning';

  const outputFile = `call_${day}_${month}_${timeFile}.mp3`;
  const outputPath = path.join(GENERATED_DIR, outputFile);

  // Return cached if exists
  if (fs.existsSync(outputPath)) {
    return `${BASE}/uploads/ivr/generated/${outputFile}`;
  }

  const files = [
    path.join(IVR_DIR, 'intro.mp3'),
    path.join(IVR_DIR, `day_${day}.mp3`),
    path.join(IVR_DIR, `month_${month}.mp3`),
    path.join(IVR_DIR, 'between_hours.mp3'),
    path.join(IVR_DIR, `${timeFile}.mp3`),
  ];

  // Verify all files exist
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`[IVR] Missing audio file: ${f}`);
      return `${BASE}/uploads/ivr/intro.mp3`;
    }
  }

  const concatContent = files.map((f) => `file '${f}'`).join('\n');
  const concatFile = path.join(GENERATED_DIR, `concat_${order.id}.txt`);
  fs.writeFileSync(concatFile, concatContent);

  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -codec:a libmp3lame -b:a 128k -ar 8000 -ac 1 "${outputPath}"`,
      { timeout: 10000, stdio: 'pipe' }
    );
    fs.unlinkSync(concatFile);
    console.log(`[IVR] Generated combined audio: ${outputFile}`);
  } catch (err: any) {
    console.error('[IVR] Error generating audio:', err.message);
    try { fs.unlinkSync(concatFile); } catch { /* */ }
    return `${BASE}/uploads/ivr/intro.mp3`;
  }

  return `${BASE}/uploads/ivr/generated/${outputFile}`;
}
