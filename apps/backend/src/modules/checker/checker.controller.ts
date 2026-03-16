import { Response } from 'express';
import sharp from 'sharp';
import { BarcodeDetector } from 'barcode-detector/pure';
import { checkerService } from './checker.service';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

// WASM barcode detectors for server-side decoding
const wasmDetectorAll = new BarcodeDetector();
const wasmDetector128 = new BarcodeDetector({ formats: ['code_128'] });

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

  // Server-side barcode decoding with sharp image processing
  decodeBarcode: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { image } = req.body; // base64 data URL or raw base64
    if (!image) {
      res.status(400).json({ success: false, error: 'No image provided' });
      return;
    }

    // Extract base64 data
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const results: string[] = [];
    let decoded: string | null = null;

    try {
      const meta = await sharp(imageBuffer).metadata();
      results.push(`orig:${meta.width}x${meta.height}`);

      // Strategy 1: Grayscale + normalize (auto contrast) + sharpen
      const processedVariants = [
        {
          name: 'gray-norm-sharp',
          buf: await sharp(imageBuffer)
            .grayscale()
            .normalize()
            .sharpen({ sigma: 2, m1: 1.5, m2: 0.7 })
            .png()
            .toBuffer(),
        },
        {
          name: 'gray-sharp-resize',
          buf: await sharp(imageBuffer)
            .grayscale()
            .normalize()
            .sharpen({ sigma: 3, m1: 2.0, m2: 1.0 })
            .resize(1280, null, { fit: 'inside' })
            .png()
            .toBuffer(),
        },
        {
          name: 'threshold-128',
          buf: await sharp(imageBuffer)
            .grayscale()
            .normalize()
            .sharpen({ sigma: 2 })
            .threshold(128)
            .png()
            .toBuffer(),
        },
        {
          name: 'threshold-100',
          buf: await sharp(imageBuffer)
            .grayscale()
            .normalize()
            .sharpen({ sigma: 2 })
            .threshold(100)
            .png()
            .toBuffer(),
        },
        {
          name: 'threshold-160',
          buf: await sharp(imageBuffer)
            .grayscale()
            .normalize()
            .sharpen({ sigma: 2 })
            .threshold(160)
            .png()
            .toBuffer(),
        },
        {
          name: 'center-crop-thresh',
          buf: await (async () => {
            const w = meta.width || 1000;
            const h = meta.height || 1000;
            const cropH = Math.floor(h * 0.3);
            const top = Math.floor((h - cropH) / 2);
            return sharp(imageBuffer)
              .extract({ left: 0, top, width: w, height: cropH })
              .grayscale()
              .normalize()
              .sharpen({ sigma: 3 })
              .threshold(128)
              .png()
              .toBuffer();
          })(),
        },
        {
          name: 'center-crop-sharp',
          buf: await (async () => {
            const w = meta.width || 1000;
            const h = meta.height || 1000;
            const cropH = Math.floor(h * 0.3);
            const top = Math.floor((h - cropH) / 2);
            return sharp(imageBuffer)
              .extract({ left: 0, top, width: w, height: cropH })
              .grayscale()
              .normalize()
              .sharpen({ sigma: 2, m1: 2.0, m2: 1.0 })
              .resize(1280, null, { fit: 'inside' })
              .png()
              .toBuffer();
          })(),
        },
      ];

      for (const variant of processedVariants) {
        try {
          // Try all-format detector
          const barcodes = await wasmDetectorAll.detect(
            new Blob([new Uint8Array(variant.buf)], { type: 'image/png' }) as any
          );
          if (barcodes.length > 0) {
            decoded = barcodes[0].rawValue;
            results.push(`${variant.name}:WA:"${decoded}"(${barcodes[0].format})`);
            break;
          }

          // Try code_128 specific
          const barcodes128 = await wasmDetector128.detect(
            new Blob([new Uint8Array(variant.buf)], { type: 'image/png' }) as any
          );
          if (barcodes128.length > 0) {
            decoded = barcodes128[0].rawValue;
            results.push(`${variant.name}:W128:"${decoded}"`);
            break;
          }

          results.push(`${variant.name}:0`);
        } catch (e: any) {
          results.push(`${variant.name}:E-${e?.message?.slice(0, 30)}`);
        }
      }
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
