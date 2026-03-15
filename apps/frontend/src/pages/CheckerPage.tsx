import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  LinearProgress, Chip, Alert, Snackbar, IconButton,
  Dialog, DialogTitle, DialogContent, Checkbox, CircularProgress,
  InputAdornment, ToggleButton, ToggleButtonGroup, Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  ArrowBack as ArrowBackIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Logout as LogoutIcon,
  QrCodeScanner as ScannerIcon,
  Close as CloseIcon,
  FlashlightOn as FlashOnIcon,
  FlashlightOff as FlashOffIcon,
  CameraAlt as CameraIcon,
} from '@mui/icons-material';
import { BarcodeDetector as WasmBarcodeDetector } from 'barcode-detector/pure';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import Quagga from '@ericblade/quagga2';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { checkerApi, CheckerOrder, CheckerOrderDetail } from '../services/checkerApi';
import { useAuthStore } from '../store/authStore';

const DEPT_LABELS: Record<string, string> = {
  GENERAL_TRANSPORT: 'הובלה כללית',
  KITCHEN_TRANSPORT: 'הובלות מטבחים',
  INTERIOR_DOOR_TRANSPORT: 'הובלת דלתות פנים',
  SHOWER_INSTALLATION: 'התקנת מקלחונים',
  INTERIOR_DOOR_INSTALLATION: 'התקנת דלתות פנים',
  KITCHEN_INSTALLATION: 'התקנת מטבחים',
  PERGOLA_INSTALLATION: 'התקנת פרגולות',
};

function formatDate(d: string) {
  const date = new Date(d);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
}

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

// WASM-based barcode detector - try without format filter first (detect ALL)
const wasmDetectorAll = new WasmBarcodeDetector();
// Also one with specific formats
const wasmDetector128 = new WasmBarcodeDetector({ formats: ['code_128'] });

export default function CheckerPage() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [scannerDebug, setScannerDebug] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string>(''); // data URL of last capture for debugging
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<any>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Extract order number from barcode: T-ORDERNUMBER-DIGIT → ORDERNUMBER
  const extractOrderNumber = (barcode: string): string => {
    const match = barcode.match(/T-(\d+)-\d+/);
    return match ? match[1] : barcode;
  };

  // Handle successful barcode detection
  const handleBarcodeDetected = useCallback((barcodeValue: string) => {
    const orderNum = extractOrderNumber(barcodeValue);
    setSelectedDate('');
    setStatusFilter('all');
    setSearchInput(orderNum);
    setSearchQuery(orderNum);
    setSnackbar({ message: `נסרק: ${barcodeValue} → הזמנה ${orderNum}`, severity: 'success' });
  }, []);

  // Stop scanner
  const stopScanner = useCallback(async () => {
    // Stop html5-qrcode
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        if (state === 2 /* SCANNING */ || state === 3 /* PAUSED */) {
          await html5QrCodeRef.current.stop();
        }
      } catch { /* */ }
      html5QrCodeRef.current = null;
    }
    // Stop custom scanner
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    try { controlsRef.current?.stop(); } catch { /* */ }
    controlsRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScannerOpen(false);
    setTorchOn(false);
    setHasTorch(false);
    setCapturing(false);
  }, []);

  // Start scanner using html5-qrcode library (proven for mobile barcode scanning)
  const startScanner = useCallback(async () => {
    setScannerOpen(true);
    setScannerDebug('מפעיל סורק html5-qrcode...');
    setScanCount(0);

    // Wait for the scanner div to render
    await new Promise((r) => setTimeout(r, 500));

    try {
      const scannerDiv = document.getElementById('html5-qrcode-scanner');
      if (!scannerDiv) {
        setScannerDebug('שגיאה: אלמנט סורק לא נמצא');
        return;
      }

      const html5QrCode = new Html5Qrcode('html5-qrcode-scanner', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
        verbose: false,
      });
      html5QrCodeRef.current = html5QrCode;

      let scanN = 0;
      let found = false;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            // Wide rectangle for 1D barcodes
            const w = Math.floor(viewfinderWidth * 0.9);
            const h = Math.floor(viewfinderHeight * 0.25);
            return { width: w, height: h };
          },
          aspectRatio: 16 / 9,
          disableFlip: false,
        },
        // Success callback
        (decodedText: string, _decodedResult: any) => {
          if (found) return;
          found = true;
          setScannerDebug(`html5-qr: "${decodedText}"`);
          // Stop and handle
          html5QrCode.stop().catch(() => {}).then(() => {
            html5QrCodeRef.current = null;
            setScannerOpen(false);
            handleBarcodeDetected(decodedText);
          });
        },
        // Error callback (fires every failed scan — just update counter)
        (_errorMessage: string) => {
          scanN++;
          if (scanN % 15 === 0) {
            setScannerDebug(`html5-qr | סורק... #${scanN}`);
            setScanCount(scanN);
          }
        },
      );

      // Try to apply zoom after start
      try {
        const videoElem = scannerDiv.querySelector('video');
        if (videoElem && videoElem.srcObject) {
          const track = (videoElem.srcObject as MediaStream).getVideoTracks()[0];
          const caps = track?.getCapabilities?.() as any;
          if (caps?.zoom) {
            const targetZoom = Math.min(2.0, caps.zoom.max);
            await track.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
            setScannerDebug(`html5-qr | zoom ${targetZoom.toFixed(1)} | סורק...`);
          }
          if (caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
          }
          if (caps?.torch) setHasTorch(true);
        }
      } catch { /* */ }

      setScannerDebug('html5-qr | סריקה רציפה...');
    } catch (err: any) {
      setScannerDebug(`שגיאה: ${err?.message || err}`);
      // Fallback: if html5-qrcode fails, don't close - show error
    }
  }, [handleBarcodeDetected]);

  // Embedded Code 128 barcode "T-12345-1" as base64 PNG (generated with JsBarcode)
  const TEST_BARCODE_DATA_URL = 'data:image/png;base64,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';

  // Self-test: decode a known embedded Code 128 barcode to verify decoders work
  const runSelfTest = useCallback(async () => {
    setScannerDebug('בדיקה עצמית...');
    setCapturedImage('');
    const results: string[] = ['TEST'];

    try {
      // Load embedded barcode image
      const testImg = document.createElement('img');
      testImg.src = TEST_BARCODE_DATA_URL;
      await new Promise<void>((resolve) => { testImg.onload = () => resolve(); });
      results.push(`img:${testImg.naturalWidth}x${testImg.naturalHeight}`);

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = testImg.naturalWidth;
      canvas.height = testImg.naturalHeight;
      canvas.getContext('2d')!.drawImage(testImg, 0, 0);
      setCapturedImage(canvas.toDataURL('image/png'));

      // Try WASM (all formats)
      try {
        const barcodes = await wasmDetectorAll.detect(canvas);
        results.push(barcodes.length > 0 ? `WA:"${barcodes[0].rawValue}"(${barcodes[0].format})` : 'WA:0');
      } catch (e: any) {
        results.push(`WA:E${e?.message?.slice(0, 30)}`);
      }

      // Try WASM (code_128 only)
      try {
        const barcodes = await wasmDetector128.detect(canvas);
        results.push(barcodes.length > 0 ? `W128:"${barcodes[0].rawValue}"` : 'W128:0');
      } catch (e: any) {
        results.push(`W128:E${e?.message?.slice(0, 30)}`);
      }

      // Try native BarcodeDetector
      if ('BarcodeDetector' in window) {
        try {
          const nativeBD = new (window as any).BarcodeDetector({ formats: ['code_128'] });
          const barcodes = await nativeBD.detect(canvas);
          results.push(barcodes.length > 0 ? `NAT:"${barcodes[0].rawValue}"` : 'NAT:0');
        } catch (e: any) {
          results.push(`NAT:E${e?.message?.slice(0, 30)}`);
        }
      } else {
        results.push('NAT:N/A');
      }

      // Try Quagga
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const q = await decodeWithQuagga(dataUrl);
        results.push(q ? `QG:"${q}"` : 'QG:0');
      } catch (e: any) {
        results.push(`QG:E`);
      }

    } catch (e: any) {
      results.push(`err:${e?.message?.slice(0, 40)}`);
    }

    setScannerDebug(results.join(' | '));
  }, []);

  // Helper: downscale image to max width for better decode performance
  const downscaleCanvas = (source: HTMLCanvasElement | HTMLImageElement, maxWidth: number): HTMLCanvasElement => {
    const sw = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
    const sh = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
    const scale = sw > maxWidth ? maxWidth / sw : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(sw * scale);
    canvas.height = Math.floor(sh * scale);
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  // Helper: get pixel sample to verify image has real data
  const getPixelSample = (canvas: HTMLCanvasElement): string => {
    const ctx = canvas.getContext('2d')!;
    const d = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    return `px(${d[0]},${d[1]},${d[2]})`;
  };

  // Helper: decode using Quagga2 (specialized for 1D barcodes)
  const decodeWithQuagga = (dataUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      Quagga.decodeSingle(
        {
          src: dataUrl,
          numOfWorkers: 0,
          locate: true,
          decoder: {
            readers: ['code_128_reader', 'code_39_reader', 'ean_reader', 'ean_8_reader'],
          },
        },
        (result: any) => {
          if (result?.codeResult?.code) {
            resolve(result.codeResult.code);
          } else {
            resolve(null);
          }
        },
      );
    });
  };

  // Try all decode methods on a canvas, return result or null
  const tryAllDecoders = async (canvas: HTMLCanvasElement, results: string[], label: string): Promise<string | null> => {
    // WASM detector (all formats)
    try {
      const barcodes = await wasmDetectorAll.detect(canvas);
      if (barcodes.length > 0) {
        const bc = barcodes[0];
        results.push(`${label} WA: "${bc.rawValue}"(${bc.format})`);
        return bc.rawValue;
      }
      results.push(`${label} WA:0`);
    } catch (err: any) {
      results.push(`${label} WA:E${err?.message?.slice(0, 25)}`);
    }

    // WASM detector (code_128 only)
    try {
      const barcodes = await wasmDetector128.detect(canvas);
      if (barcodes.length > 0) {
        results.push(`${label} W128: "${barcodes[0].rawValue}"`);
        return barcodes[0].rawValue;
      }
      results.push(`${label} W128:0`);
    } catch (err: any) {
      results.push(`${label} W128:E${err?.message?.slice(0, 20)}`);
    }

    // Native BarcodeDetector (Chrome Android built-in)
    if ('BarcodeDetector' in window) {
      try {
        const nativeBD = new (window as any).BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13'] });
        const barcodes = await nativeBD.detect(canvas);
        if (barcodes.length > 0) {
          results.push(`${label} NAT: "${barcodes[0].rawValue}"`);
          return barcodes[0].rawValue;
        }
        results.push(`${label} NAT:0`);
      } catch (err: any) {
        results.push(`${label} NAT:E${err?.message?.slice(0, 20)}`);
      }
    }

    // Quagga
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const q = await decodeWithQuagga(dataUrl);
      if (q) { results.push(`${label} QG: "${q}"`); return q; }
      results.push(`${label} QG:0`);
    } catch (err: any) {
      results.push(`${label} QG:E`);
    }

    return null;
  };

  // Manual capture - take photo and decode with multiple methods
  const captureAndDecode = useCallback(async () => {
    const video = videoRef.current;

    if (!video || video.readyState < 2) {
      setScannerDebug(`וידאו לא מוכן (state=${video?.readyState})`);
      return;
    }

    setCapturing(true);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const results: string[] = [`צולם ${vw}x${vh}`];

    try {
      // Capture full frame
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = vw;
      fullCanvas.height = vh;
      fullCanvas.getContext('2d')!.drawImage(video, 0, 0);

      // Try at original size
      const r1 = await tryAllDecoders(fullCanvas, results, 'full');
      setScannerDebug(results.join(' | '));
      if (r1) { stopScanner(); handleBarcodeDetected(r1); setCapturing(false); return; }

      // Try downscaled to 800px wide
      const scaled = downscaleCanvas(fullCanvas, 800);
      results.push(`scaled:${scaled.width}x${scaled.height}`);
      const r2 = await tryAllDecoders(scaled, results, 'sm');
      setScannerDebug(results.join(' | '));
      if (r2) { stopScanner(); handleBarcodeDetected(r2); setCapturing(false); return; }

      // Try center crop (barcode region) then downscale
      const cropCanvas = document.createElement('canvas');
      const cropW = Math.floor(vw * 0.9);
      const cropH = Math.floor(vh * 0.3);
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      cropCanvas.getContext('2d')!.drawImage(
        video,
        Math.floor((vw - cropW) / 2), Math.floor((vh - cropH) / 2), cropW, cropH,
        0, 0, cropW, cropH,
      );
      const r3 = await tryAllDecoders(cropCanvas, results, 'crop');
      setScannerDebug(results.join(' | '));
      if (r3) { stopScanner(); handleBarcodeDetected(r3); setCapturing(false); return; }

      // All failed
      setSnackbar({ message: 'לא זוהה ברקוד. התקרב ונסה שוב.', severity: 'info' });
    } catch (err: any) {
      setScannerDebug(`שגיאה: ${err?.message || err}`);
    }

    setCapturing(false);
  }, [stopScanner, handleBarcodeDetected]);

  // Handle photo from native camera app (file input with capture="environment")
  const handleNativeCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCapturing(true);
    const results: string[] = [`קובץ: ${(file.size / 1024).toFixed(0)}KB`];
    setScannerDebug(results[0]);

    try {
      const blobUrl = URL.createObjectURL(file);

      // Load image
      const img = document.createElement('img');
      img.src = blobUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('img load failed'));
      });

      const ow = img.naturalWidth;
      const oh = img.naturalHeight;
      results.push(`${ow}x${oh}`);

      // Check supported formats + native availability
      try {
        const fmts = await WasmBarcodeDetector.getSupportedFormats();
        results.push(`fmts:${fmts.length}`);
        const hasNative = 'BarcodeDetector' in window;
        results.push(hasNative ? 'NAT:yes' : 'NAT:no');
      } catch (e: any) {
        results.push(`fmts:E${e?.message?.slice(0, 15)}`);
      }
      setScannerDebug(results.join(' | '));

      // Create downscaled canvas (1280px - sweet spot for barcode detection)
      const scaled = downscaleCanvas(img, 1280);
      results.push(`→${scaled.width}x${scaled.height}`);
      results.push(getPixelSample(scaled));
      // Save for visual debugging
      setCapturedImage(scaled.toDataURL('image/jpeg', 0.7));
      setScannerDebug(results.join(' | '));

      // Try on downscaled (best size for decoders)
      const r1 = await tryAllDecoders(scaled, results, 'S');
      setScannerDebug(results.join(' | '));
      if (r1) { URL.revokeObjectURL(blobUrl); handleBarcodeDetected(r1); setCapturing(false); if (fileInputRef.current) fileInputRef.current.value = ''; return; }

      // Try on ImageData directly (in case canvas input is the issue)
      try {
        const ctx = scaled.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, scaled.width, scaled.height);
        const barcodes = await wasmDetectorAll.detect(imageData as any);
        if (barcodes.length > 0) {
          results.push(`ID: "${barcodes[0].rawValue}"`);
          setScannerDebug(results.join(' | '));
          URL.revokeObjectURL(blobUrl);
          handleBarcodeDetected(barcodes[0].rawValue);
          setCapturing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        results.push('ID:0');
      } catch (e: any) {
        results.push(`ID:E${e?.message?.slice(0, 25)}`);
      }
      setScannerDebug(results.join(' | '));

      // Try on Blob directly
      try {
        const blob = await new Promise<Blob>((resolve) => scaled.toBlob((b) => resolve(b!), 'image/png'));
        const barcodes = await wasmDetectorAll.detect(blob as any);
        if (barcodes.length > 0) {
          results.push(`BL: "${barcodes[0].rawValue}"`);
          setScannerDebug(results.join(' | '));
          URL.revokeObjectURL(blobUrl);
          handleBarcodeDetected(barcodes[0].rawValue);
          setCapturing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        results.push('BL:0');
      } catch (e: any) {
        results.push(`BL:E${e?.message?.slice(0, 25)}`);
      }
      setScannerDebug(results.join(' | '));

      URL.revokeObjectURL(blobUrl);
      setSnackbar({ message: 'לא זוהה. נסה לצלם קרוב יותר, ישר, עם תאורה טובה.', severity: 'info' });
    } catch (err: any) {
      setScannerDebug(`שגיאה: ${err?.message || err}`);
    }

    setCapturing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleBarcodeDetected]);

  // Toggle torch
  const toggleTorch = useCallback(() => {
    const stream = streamRef.current || (videoRef.current?.srcObject as MediaStream);
    const track = stream?.getVideoTracks()[0];
    if (track) {
      const newState = !torchOn;
      (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    }
  }, [torchOn]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      try { controlsRef.current?.stop(); } catch { /* */ }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Fetch orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['checker-orders', searchQuery, statusFilter, selectedDate],
    queryFn: () => checkerApi.searchOrders(searchQuery || undefined, statusFilter, selectedDate || undefined),
  });

  const { data: orderDetail, isLoading: linesLoading } = useQuery({
    queryKey: ['checker-lines', selectedOrder],
    queryFn: () => checkerApi.getOrderLines(selectedOrder!),
    enabled: !!selectedOrder,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ lineId, checked }: { lineId: number; checked: boolean }) =>
      checkerApi.toggleLineCheck(lineId, checked),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['checker-lines', selectedOrder] });
      queryClient.invalidateQueries({ queryKey: ['checker-orders'] });
      if (result.allLinesChecked) {
        setSnackbar({ message: 'כל השורות נבדקו!', severity: 'success' });
      }
    },
    onError: () => setSnackbar({ message: 'שגיאה בעדכון', severity: 'error' }),
  });

  const handleSearch = () => setSearchQuery(searchInput);
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const allChecked = orderDetail
    ? orderDetail.orderLines.length > 0 && orderDetail.orderLines.every((l) => l.checkedByInspector)
    : false;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      {/* Header */}
      <Box sx={{ bgcolor: 'primary.main', color: 'white', px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight="bold">בודק הזמנות</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {user?.fullName && <Typography variant="body2">{user.fullName}</Typography>}
          <IconButton color="inherit" size="small" onClick={logout}><LogoutIcon /></IconButton>
        </Box>
      </Box>

      {/* Search + Filters */}
      <Box sx={{ p: 2 }}>
        <TextField type="date" size="small" fullWidth value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          sx={{ mb: 1.5, bgcolor: 'white', borderRadius: 1 }}
          InputLabelProps={{ shrink: true }} label="תאריך" />

        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField fullWidth placeholder="חפש לפי מספר הזמנה, שם לקוח, טלפון..."
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown} size="medium"
            sx={{ bgcolor: 'white', borderRadius: 1, '& .MuiInputBase-root': { height: 48 } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={handleSearch} edge="end"><SearchIcon /></IconButton>
                </InputAdornment>
              ),
            }} />
          <Button variant="contained" onClick={startScanner}
            sx={{ minWidth: 48, height: 48, p: 0 }} color="primary">
            <ScannerIcon />
          </Button>
          <Button variant="outlined" onClick={() => fileInputRef.current?.click()}
            sx={{ minWidth: 48, height: 48, p: 0 }} color="secondary">
            <CameraIcon />
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
            onChange={handleNativeCapture} style={{ display: 'none' }} />
        </Box>

        {/* Debug area - always visible */}
        {scannerDebug && (
          <Box sx={{ mb: 1.5, p: 1, bgcolor: '#fff3e0', borderRadius: 1, border: '1px solid #ff9800' }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', display: 'block' }}>
              🔍 {scannerDebug}
            </Typography>
          </Box>
        )}
        {/* Self-test button */}
        <Button variant="text" size="small" onClick={runSelfTest} sx={{ mb: 0.5, fontSize: 11 }}>
          🧪 בדיקת מפענח
        </Button>
        {/* Show captured/test image */}
        {capturedImage && (
          <Box sx={{ mb: 1.5, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>תמונה שנשלחה למפענח:</Typography>
            <img src={capturedImage} alt="captured" style={{ maxWidth: '100%', maxHeight: 200, border: '1px solid #ccc' }} />
          </Box>
        )}

        <ToggleButtonGroup value={statusFilter} exclusive
          onChange={(_, val) => val && setStatusFilter(val)} fullWidth size="small" sx={{ mb: 2 }}>
          <ToggleButton value="all">הכל</ToggleButton>
          <ToggleButton value="unchecked">לא נבדק</ToggleButton>
          <ToggleButton value="checked">נבדק</ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {ordersLoading ? 'טוען...' : `${orders.length} הזמנות`}
        </Typography>
      </Box>

      {/* Orders List */}
      <Box sx={{ px: 2, pb: 2 }}>
        {ordersLoading && <LinearProgress />}
        {orders.map((order: CheckerOrder) => (
          <Card key={order.id} sx={{
            mb: 1.5, cursor: 'pointer',
            border: order.isFullyChecked ? '2px solid #4caf50' : '1px solid #e0e0e0',
            bgcolor: order.isFullyChecked ? '#f1f8e9' : 'white',
            '&:active': { transform: 'scale(0.98)' },
          }} onClick={() => setSelectedOrder(order.id)}>
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="subtitle1" fontWeight="bold">{order.orderNumber}</Typography>
                <Chip size="small" label={order.isFullyChecked ? 'נבדק' : 'לא נבדק'}
                  color={order.isFullyChecked ? 'success' : 'default'}
                  variant={order.isFullyChecked ? 'filled' : 'outlined'} />
              </Box>
              <Typography variant="body2">{order.customerName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {order.city} | {formatDate(order.deliveryDate)}
                {order.department ? ` | ${DEPT_LABELS[order.department] || order.department}` : ''}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <LinearProgress variant="determinate"
                  value={order.totalLines > 0 ? (order.checkedLines / order.totalLines) * 100 : 0}
                  sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                  color={order.isFullyChecked ? 'success' : 'primary'} />
                <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 50, textAlign: 'left' }}>
                  {order.checkedLines}/{order.totalLines}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
        {!ordersLoading && orders.length === 0 && (
          <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>לא נמצאו הזמנות</Typography>
        )}
      </Box>

      {/* Order Lines Dialog */}
      <Dialog open={!!selectedOrder} onClose={() => setSelectedOrder(null)} fullScreen
        PaperProps={{ sx: { bgcolor: '#f5f5f5' } }}>
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
          <IconButton color="inherit" onClick={() => setSelectedOrder(null)} edge="start"><ArrowBackIcon /></IconButton>
          <Box sx={{ flexGrow: 1 }}>
            {orderDetail && (
              <>
                <Typography variant="subtitle1" fontWeight="bold">{orderDetail.orderNumber}</Typography>
                <Typography variant="body2">{orderDetail.customerName}</Typography>
              </>
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          {linesLoading && <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 4 }} />}
          {allChecked && orderDetail && orderDetail.orderLines.length > 0 && (
            <Alert severity="success" sx={{ mb: 2, fontSize: 16 }} icon={<CheckCircleIcon />}>כל השורות נבדקו!</Alert>
          )}
          {orderDetail && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'white', borderRadius: 1 }}>
              <Typography variant="body2"><strong>כתובת:</strong> {orderDetail.address}, {orderDetail.city}</Typography>
              <Typography variant="body2"><strong>טלפון:</strong> {orderDetail.phone}</Typography>
              <Typography variant="body2"><strong>תאריך:</strong> {formatDate(orderDetail.deliveryDate)}</Typography>
            </Box>
          )}
          <Divider sx={{ mb: 2 }} />
          {orderDetail?.orderLines.map((line) => (
            <Card key={line.id} sx={{
              mb: 1, border: line.checkedByInspector ? '2px solid #4caf50' : '1px solid #e0e0e0',
              bgcolor: line.checkedByInspector ? '#f1f8e9' : 'white',
            }}>
              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 }, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox checked={line.checkedByInspector}
                  onChange={() => toggleMutation.mutate({ lineId: line.id, checked: !line.checkedByInspector })}
                  sx={{ '& .MuiSvgIcon-root': { fontSize: 32 } }}
                  icon={<UncheckedIcon sx={{ fontSize: 32, color: '#bdbdbd' }} />}
                  checkedIcon={<CheckCircleIcon sx={{ fontSize: 32, color: '#4caf50' }} />} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body1" fontWeight="bold" noWrap>{line.product}</Typography>
                  {line.description && <Typography variant="body2" color="text.secondary" noWrap>{line.description}</Typography>}
                  <Typography variant="body2" color="text.secondary">כמות: {line.quantity} | משקל: {line.weight} ק"ג</Typography>
                </Box>
                <Typography variant="h6" color="text.secondary" sx={{ minWidth: 30, textAlign: 'center' }}>{line.lineNumber}</Typography>
              </CardContent>
            </Card>
          ))}
        </DialogContent>
      </Dialog>

      {/* Scanner - Full screen overlay using html5-qrcode */}
      {scannerOpen && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, bgcolor: 'black', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Box sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            p: 1, bgcolor: 'rgba(0,0,0,0.8)', zIndex: 10,
          }}>
            <IconButton onClick={stopScanner} sx={{ color: 'white' }}><CloseIcon /></IconButton>
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography color="white" fontWeight="bold" fontSize={13}>כוון את הברקוד למסגרת</Typography>
              {scannerDebug && <Typography color="rgba(255,255,255,0.6)" fontSize={10}>{scannerDebug}</Typography>}
            </Box>
            {hasTorch ? (
              <IconButton onClick={toggleTorch} sx={{ color: torchOn ? '#ffc107' : 'white' }}>
                {torchOn ? <FlashOnIcon /> : <FlashOffIcon />}
              </IconButton>
            ) : <Box sx={{ width: 48 }} />}
          </Box>

          {/* html5-qrcode scanner container */}
          <Box id="html5-qrcode-scanner" sx={{
            flex: 1,
            '& video': { objectFit: 'cover !important' },
            '& #qr-shaded-region': { borderColor: '#ff1744 !important' },
          }} />

          {/* Bottom status */}
          <Box sx={{
            p: 1.5, bgcolor: 'rgba(0,0,0,0.8)', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
          }}>
            <CircularProgress size={18} sx={{ color: '#4caf50' }} />
            <Typography color="white" fontSize={13}>סורק... #{scanCount}</Typography>
          </Box>
        </Box>
      )}

      {/* Snackbar */}
      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
