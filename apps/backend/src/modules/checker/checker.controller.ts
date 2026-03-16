import { Response } from 'express';
import sharp from 'sharp';
import { BarcodeDetector } from 'barcode-detector/pure';
import { scanGrayBuffer } from '@undecaf/zbar-wasm';
import { checkerService } from './checker.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

// WASM barcode detectors for server-side decoding
const wasmDetectorAll = new BarcodeDetector();
const wasmDetector128 = new BarcodeDetector({ formats: ['code_128'] });

// Helper: decode using ZBar on a sharp-processed grayscale buffer
async function tryZBar(imageBuffer: Buffer, label: string, results: string[]): Promise<string | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .grayscale()
      .normalize()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const symbols = await scanGrayBuffer(data.buffer as ArrayBuffer, info.width, info.height);
    if (symbols.length > 0) {
      const val = symbols[0].decode();
      results.push(`${label}:ZB:"${val}"(${symbols[0].typeName})`);
      return val;
    }
    results.push(`${label}:ZB:0`);
  } catch (e: any) {
    results.push(`${label}:ZB:E-${e?.message?.slice(0, 30)}`);
  }
  return null;
}

export const checkerController = {
  searchOrders: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { q, status, date } = req.query;
    const orders = await checkerService.searchOrders({
      search: q as string,
      inspectionStatus: (status as 'all' | 'checked' | 'unchecked') || 'all',
      date: date as string,
    });
    res.json({ success: true, data: orders });
  }),

  getOrderLines: asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = parseInt(req.params.orderId as string);
    const order = await checkerService.getOrderLines(orderId);
    res.json({ success: true, data: order });
  }),

  toggleLineCheck: asyncHandler(async (req: AuthRequest, res: Response) => {
    const lineId = parseInt(req.params.lineId as string);
    const { checked } = req.body;
    const result = await checkerService.toggleLineCheck(lineId, checked);
    res.json({ success: true, data: result });
  }),

  // Server-side barcode decoding with sharp + ZBar + ZXing
  decodeBarcode: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ success: false, error: 'No image provided' });
      return;
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const results: string[] = [];
    let decoded: string | null = null;

    try {
      const meta = await sharp(imageBuffer).metadata();
      const w = meta.width || 1000;
      const h = meta.height || 1000;
      results.push(`orig:${w}x${h}`);

      // === ZBar decoder (much better for 1D barcodes from camera) ===

      // 1. Raw image → ZBar
      decoded = await tryZBar(imageBuffer, 'raw', results);
      if (decoded) { res.json({ success: true, data: { decoded, debug: results.join(' | ') } }); return; }

      // 2. Grayscale + normalize + sharpen → ZBar
      const sharpened = await sharp(imageBuffer).grayscale().normalize().sharpen({ sigma: 2 }).png().toBuffer();
      decoded = await tryZBar(sharpened, 'sharp', results);
      if (decoded) { res.json({ success: true, data: { decoded, debug: results.join(' | ') } }); return; }

      // 3. Resize to 1280 + sharpen → ZBar
      const resized = await sharp(imageBuffer).grayscale().normalize().sharpen({ sigma: 3 }).resize(1280, null, { fit: 'inside' }).png().toBuffer();
      decoded = await tryZBar(resized, 'resize', results);
      if (decoded) { res.json({ success: true, data: { decoded, debug: results.join(' | ') } }); return; }

      // 4. Center crop (barcode region) → ZBar
      const cropH = Math.floor(h * 0.35);
      const top = Math.floor((h - cropH) / 2);
      const cropped = await sharp(imageBuffer).extract({ left: 0, top, width: w, height: cropH }).grayscale().normalize().sharpen({ sigma: 2 }).png().toBuffer();
      decoded = await tryZBar(cropped, 'crop', results);
      if (decoded) { res.json({ success: true, data: { decoded, debug: results.join(' | ') } }); return; }

      // 5. Threshold variants → ZBar
      for (const th of [100, 128, 160]) {
        const threshed = await sharp(imageBuffer).grayscale().normalize().sharpen({ sigma: 2 }).threshold(th).png().toBuffer();
        decoded = await tryZBar(threshed, `th${th}`, results);
        if (decoded) { res.json({ success: true, data: { decoded, debug: results.join(' | ') } }); return; }
      }

      // 6. Center crop + threshold → ZBar
      const cropThresh = await sharp(imageBuffer).extract({ left: 0, top, width: w, height: cropH }).grayscale().normalize().sharpen({ sigma: 3 }).threshold(128).png().toBuffer();
      decoded = await tryZBar(cropThresh, 'crop-th', results);
      if (decoded) { res.json({ success: true, data: { decoded, debug: results.join(' | ') } }); return; }

      // === Also try ZXing on sharpened + cropped ===
      try {
        const barcodes = await wasmDetectorAll.detect(
          new Blob([new Uint8Array(sharpened)], { type: 'image/png' }) as any
        );
        results.push(barcodes.length > 0 ? `ZX-sharp:"${barcodes[0].rawValue}"` : 'ZX-sharp:0');
        if (barcodes.length > 0) decoded = barcodes[0].rawValue;
      } catch { results.push('ZX:E'); }

    } catch (e: any) {
      results.push(`ERR:${e?.message?.slice(0, 50)}`);
    }

    res.json({
      success: true,
      data: {
        decoded,
        debug: results.join(' | '),
      },
    });
  }),
};
