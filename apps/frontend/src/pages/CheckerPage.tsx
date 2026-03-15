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
  const stopScanner = useCallback(() => {
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

  // Start scanner with CONTINUOUS scanning (like Cognex)
  const startScanner = useCallback(async () => {
    setScannerOpen(true);
    setScannerDebug('מפעיל מצלמה...');
    setScanCount(0);

    await new Promise((r) => setTimeout(r, 400));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Continuous autofocus + torch check
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track?.getCapabilities?.() as any;
        if (caps?.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
        }
        if (caps?.torch) setHasTorch(true);
      } catch { /* */ }

      const s = track.getSettings();
      const resolution = `${s.width}x${s.height}`;

      // Start continuous scanning every 300ms
      let count = 0;
      let scanning = false;
      scanIntervalRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || scanning) return;
        scanning = true;
        count++;

        try {
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          // Try native BarcodeDetector directly on video element (fastest)
          if ('BarcodeDetector' in window) {
            try {
              const nativeBD = new (window as any).BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8'] });
              const barcodes = await nativeBD.detect(video);
              if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                setScannerDebug(`${resolution} | #${count} NAT: "${code}"`);
                // Stop scanning and handle result
                if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
                stopScanner();
                handleBarcodeDetected(code);
                return;
              }
            } catch { /* */ }
          }

          // Try WASM detector on video element
          try {
            const barcodes = await wasmDetectorAll.detect(video);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              setScannerDebug(`${resolution} | #${count} WASM: "${code}"`);
              if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
              scanIntervalRef.current = null;
              stopScanner();
              handleBarcodeDetected(code);
              return;
            }
          } catch { /* */ }

          // Try WASM on center-cropped canvas
          const cropCanvas = document.createElement('canvas');
          const cropW = vw;
          const cropH = Math.floor(vh * 0.3);
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          cropCanvas.getContext('2d')!.drawImage(
            video,
            0, Math.floor((vh - cropH) / 2), cropW, cropH,
            0, 0, cropW, cropH,
          );
          try {
            const barcodes = await wasmDetectorAll.detect(cropCanvas);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              setScannerDebug(`${resolution} | #${count} WASM-crop: "${code}"`);
              if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
              scanIntervalRef.current = null;
              stopScanner();
              handleBarcodeDetected(code);
              return;
            }
          } catch { /* */ }

          setScannerDebug(`${resolution} | סורק... #${count}`);
          setScanCount(count);
        } catch { /* */ }

        scanning = false;
      }, 300);

      setScannerDebug(`${resolution} | סריקה רציפה...`);
    } catch (err: any) {
      setScannerOpen(false);
      setSnackbar({ message: `שגיאת מצלמה: ${err?.message || err}`, severity: 'error' });
    }
  }, [stopScanner, handleBarcodeDetected]);

  // Self-test: generate a Code 128 barcode on canvas and try to decode it
  const runSelfTest = useCallback(async () => {
    setScannerDebug('בדיקה עצמית...');
    setCapturedImage('');
    const results: string[] = ['TEST'];

    // Create a test image by loading a known Code 128 barcode from an online generator
    try {
      const testImg = document.createElement('img');
      testImg.crossOrigin = 'anonymous';
      // Use a simple barcode generator URL
      testImg.src = 'https://barcode.tec-it.com/barcode.ashx?data=T-12345-1&code=Code128&translate-esc=true&dmsize=Default&unit=Fit&imagetype=Png&rotation=0&color=%23000000&bgcolor=%23ffffff&qunit=Mm&quiet=0';

      const loaded = await Promise.race([
        new Promise<boolean>((resolve) => { testImg.onload = () => resolve(true); testImg.onerror = () => resolve(false); }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);

      if (!loaded) {
        // Fallback: draw a simple test pattern (thick black/white bars)
        results.push('URL fail, testing native API');
        setScannerDebug(results.join(' | '));

        // Just test if detect() works at all with an empty canvas
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 400;
        testCanvas.height = 100;
        const ctx = testCanvas.getContext('2d')!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 400, 100);
        // Draw some black bars
        ctx.fillStyle = 'black';
        for (let i = 0; i < 40; i++) {
          if (i % 2 === 0) ctx.fillRect(10 + i * 9, 5, 5, 90);
        }

        try {
          const barcodes = await wasmDetectorAll.detect(testCanvas);
          results.push(`WASM detect ran OK: ${barcodes.length} results`);
        } catch (e: any) {
          results.push(`WASM detect error: ${e?.message?.slice(0, 40)}`);
        }

        if ('BarcodeDetector' in window) {
          try {
            const nativeBD = new (window as any).BarcodeDetector({ formats: ['code_128'] });
            const barcodes = await nativeBD.detect(testCanvas);
            results.push(`NAT detect ran OK: ${barcodes.length} results`);
          } catch (e: any) {
            results.push(`NAT detect error: ${e?.message?.slice(0, 40)}`);
          }
        }

        setScannerDebug(results.join(' | '));
        return;
      }

      results.push(`test img: ${testImg.naturalWidth}x${testImg.naturalHeight}`);

      // Try WASM
      try {
        const bitmap = await createImageBitmap(testImg);
        const barcodes = await wasmDetectorAll.detect(bitmap);
        bitmap.close();
        results.push(barcodes.length > 0 ? `WASM OK: "${barcodes[0].rawValue}"` : `WASM: 0`);
      } catch (e: any) {
        results.push(`WASM: E${e?.message?.slice(0, 25)}`);
      }

      // Try native
      if ('BarcodeDetector' in window) {
        try {
          const nativeBD = new (window as any).BarcodeDetector({ formats: ['code_128'] });
          const bitmap = await createImageBitmap(testImg);
          const barcodes = await nativeBD.detect(bitmap);
          bitmap.close();
          results.push(barcodes.length > 0 ? `NAT OK: "${barcodes[0].rawValue}"` : `NAT: 0`);
        } catch (e: any) {
          results.push(`NAT: E${e?.message?.slice(0, 25)}`);
        }
      }

      // Show test image
      const tc = document.createElement('canvas');
      tc.width = testImg.naturalWidth;
      tc.height = testImg.naturalHeight;
      tc.getContext('2d')!.drawImage(testImg, 0, 0);
      setCapturedImage(tc.toDataURL('image/png'));

    } catch (e: any) {
      results.push(`error: ${e?.message?.slice(0, 40)}`);
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

      {/* Scanner - Full screen overlay */}
      {scannerOpen && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, bgcolor: 'black' }}>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

          {/* Header */}
          <Box sx={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            p: 1, bgcolor: 'rgba(0,0,0,0.6)',
          }}>
            <IconButton onClick={stopScanner} sx={{ color: 'white' }}><CloseIcon /></IconButton>
            <Box sx={{ textAlign: 'center' }}>
              <Typography color="white" fontWeight="bold" fontSize={14}>כוון את הברקוד למסגרת — סריקה אוטומטית</Typography>
              {scannerDebug && <Typography color="rgba(255,255,255,0.6)" fontSize={10}>{scannerDebug}</Typography>}
            </Box>
            {hasTorch ? (
              <IconButton onClick={toggleTorch} sx={{ color: torchOn ? '#ffc107' : 'white' }}>
                {torchOn ? <FlashOnIcon /> : <FlashOffIcon />}
              </IconButton>
            ) : <Box sx={{ width: 48 }} />}
          </Box>

          {/* Scan guide */}
          <Box sx={{
            position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '85%', height: 140, zIndex: 10,
            border: '3px solid rgba(255,50,50,0.8)', borderRadius: 2,
            pointerEvents: 'none', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
          }}>
            <Box sx={{
              position: 'absolute', top: '50%', left: 8, right: 8, height: 2, bgcolor: '#ff1744',
              animation: 'scanline 2s ease-in-out infinite',
              '@keyframes scanline': {
                '0%, 100%': { transform: 'translateY(-30px)', opacity: 0.7 },
                '50%': { transform: 'translateY(30px)', opacity: 1 },
              },
            }} />
          </Box>

          {/* Scan status at bottom */}
          <Box sx={{
            position: 'absolute', bottom: 40, left: 0, right: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(0,0,0,0.6)', px: 2, py: 1, borderRadius: 2 }}>
              <CircularProgress size={20} sx={{ color: '#4caf50' }} />
              <Typography color="white" fontSize={14}>סורק... #{scanCount}</Typography>
            </Box>
            <IconButton
              onClick={captureAndDecode}
              sx={{
                width: 64, height: 64,
                bgcolor: 'rgba(255,255,255,0.7)',
                '&:active': { transform: 'scale(0.9)' },
              }}
            >
              <CameraIcon sx={{ fontSize: 32, color: '#333' }} />
            </IconButton>
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
