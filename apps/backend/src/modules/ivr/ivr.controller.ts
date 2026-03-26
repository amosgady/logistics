import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ivrService } from './ivr.service';
import prisma from '../../utils/prisma';
import { env } from '../../config/env';
import { ttsService } from '../../services/tts.service';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const BASE = env.BASE_URL || 'https://log.perfectlinesite.com';
const IVR_DIR = path.join(__dirname, '../../../uploads/ivr');
const GENERATED_DIR = path.join(IVR_DIR, 'generated');

const WEEKDAY_NAMES: Record<number, string> = {
  0: 'יום ראשון', 1: 'יום שני', 2: 'יום שלישי', 3: 'יום רביעי', 4: 'יום חמישי', 5: 'יום שישי', 6: 'שבת',
};

/**
 * Generate TTS audio URL for dynamic text (address, weekday).
 */
async function getTtsUrl(text: string): Promise<string> {
  try {
    return await ttsService.generate(text);
  } catch (err: any) {
    console.error('[IVR] TTS generation failed:', err.message);
    throw err;
  }
}

/**
 * Build a combined MP3 from recorded files + TTS for dynamic parts.
 * Flow: intro → day → month → "ביום" TTS(weekday) → between_hours → time → "לכתובת" TTS(address)
 */
async function buildCallAudio(order: {
  id: number;
  address: string;
  city: string;
  deliveryDate: Date | null;
  timeWindow: string | null;
}): Promise<string> {
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  const date = order.deliveryDate ? new Date(order.deliveryDate) : new Date();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const timeFile = order.timeWindow === 'AFTERNOON' ? 'time_afternoon' : 'time_morning';
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const address = `${order.address}, ${order.city}`;

  // Generate TTS for dynamic parts
  const [weekdayUrl, addressUrl] = await Promise.all([
    getTtsUrl(`ביום ${weekday}`),
    getTtsUrl(`לכתובת ${address}`),
  ]);

  // Download TTS files locally for concat
  const weekdayFile = path.join(GENERATED_DIR, `weekday_${order.id}.mp3`);
  const addressFile = path.join(GENERATED_DIR, `address_${order.id}.mp3`);

  await downloadFile(weekdayUrl, weekdayFile);
  await downloadFile(addressUrl, addressFile);

  // Convert TTS files to 8000Hz mono to match recorded files
  const weekdayConverted = path.join(GENERATED_DIR, `weekday_${order.id}_conv.mp3`);
  const addressConverted = path.join(GENERATED_DIR, `address_${order.id}_conv.mp3`);

  try {
    execSync(`ffmpeg -y -i "${weekdayFile}" -codec:a libmp3lame -b:a 128k -ar 8000 -ac 1 "${weekdayConverted}" 2>/dev/null`, { timeout: 5000 });
    execSync(`ffmpeg -y -i "${addressFile}" -codec:a libmp3lame -b:a 128k -ar 8000 -ac 1 "${addressConverted}" 2>/dev/null`, { timeout: 5000 });
  } catch (err: any) {
    console.error('[IVR] ffmpeg conversion failed:', err.message);
  }

  // Build concat list:
  // intro.mp3 → day_X.mp3 → month_X.mp3 → weekday(TTS) → between_hours.mp3 → time.mp3 → address(TTS)
  const files = [
    path.join(IVR_DIR, 'intro.mp3'),
    path.join(IVR_DIR, `day_${day}.mp3`),
    path.join(IVR_DIR, `month_${month}.mp3`),
    fs.existsSync(weekdayConverted) ? weekdayConverted : weekdayFile,
    path.join(IVR_DIR, 'between_hours.mp3'),
    path.join(IVR_DIR, `${timeFile}.mp3`),
    fs.existsSync(addressConverted) ? addressConverted : addressFile,
  ];

  const outputFile = `call_${order.id}.mp3`;
  const outputPath = path.join(GENERATED_DIR, outputFile);

  const concatContent = files.filter(f => fs.existsSync(f)).map(f => `file '${f}'`).join('\n');
  const concatFile = path.join(GENERATED_DIR, `concat_${order.id}.txt`);
  fs.writeFileSync(concatFile, concatContent);

  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -codec:a libmp3lame -b:a 128k -ar 8000 -ac 1 "${outputPath}"`,
      { timeout: 10000, stdio: 'pipe' }
    );
    console.log(`[IVR] Generated combined audio: ${outputFile}`);
  } catch (err: any) {
    console.error('[IVR] Error generating combined audio:', err.message);
  }

  // Cleanup temp files
  try {
    fs.unlinkSync(concatFile);
    fs.unlinkSync(weekdayFile);
    fs.unlinkSync(addressFile);
    if (fs.existsSync(weekdayConverted)) fs.unlinkSync(weekdayConverted);
    if (fs.existsSync(addressConverted)) fs.unlinkSync(addressConverted);
  } catch { /* ignore */ }

  return `${BASE}/uploads/ivr/generated/${outputFile}`;
}

/**
 * Download a URL to a local file.
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

export const ivrController = {
  /**
   * Initiate an IVR call for an order.
   * Pre-generates combined audio before starting the call.
   */
  callOrder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const targetPhone = req.body?.phone as string | undefined;

    // Pre-generate combined audio
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, address: true, city: true, deliveryDate: true, timeWindow: true },
    });

    if (order) {
      console.log(`[IVR] Pre-generating audio for order ${orderId}...`);
      await buildCallAudio(order);
      console.log(`[IVR] Audio ready for order ${orderId}`);
    }

    const result = await ivrService.callOrder(orderId, req.user!.userId, targetPhone);
    res.json({ success: true, data: result });
  }),

  /**
   * TwiML endpoint for order confirmation call.
   * Uses combined recorded + TTS audio.
   */
  orderTwiml: async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, address: true, city: true, deliveryDate: true, timeWindow: true },
    });

    if (!order) {
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      return;
    }

    try {
      const audioUrl = await buildCallAudio(order);

      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather numDigits="1" timeout="10" action="${BASE}/api/v1/ivr/gather/${orderId}" method="POST">
    <Play>${BASE}/uploads/ivr/confirm_prompt.mp3</Play>
    <Play>${BASE}/uploads/ivr/replay_prompt.mp3</Play>
  </Gather>
  <Play>${BASE}/uploads/ivr/no_response.mp3</Play>
</Response>`);
    } catch (err: any) {
      console.error(`[IVR] Failed to generate audio for order ${orderId}:`, err.message);
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    }
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
    } else if (digits === '3') {
      // Replay - rebuild full TwiML inline
      console.log(`[IVR] Order ${orderId} requested replay`);
      try {
        const replayOrder = await prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true, address: true, city: true, deliveryDate: true, timeWindow: true },
        });
        if (replayOrder) {
          const audioUrl = await buildCallAudio(replayOrder);
          res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather numDigits="1" timeout="10" action="${BASE}/api/v1/ivr/gather/${orderId}" method="POST">
    <Play>${BASE}/uploads/ivr/confirm_prompt.mp3</Play>
    <Play>${BASE}/uploads/ivr/replay_prompt.mp3</Play>
  </Gather>
  <Play>${BASE}/uploads/ivr/no_response.mp3</Play>
</Response>`);
        } else {
          res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
        }
      } catch {
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
      }
    } else {
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${BASE}/uploads/ivr/invalid.mp3</Play>
  <Gather numDigits="1" timeout="10" action="${BASE}/api/v1/ivr/gather/${orderId}" method="POST">
    <Play>${BASE}/uploads/ivr/confirm_prompt.mp3</Play>
    <Play>${BASE}/uploads/ivr/replay_prompt.mp3</Play>
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
