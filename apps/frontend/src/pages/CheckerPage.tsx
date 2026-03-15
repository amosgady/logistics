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
import { BrowserMultiFormatReader } from '@zxing/browser';
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

// Singleton reader for reuse
const zxingReader = new BrowserMultiFormatReader();

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<any>(null);

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
    setScannerDebug('');
    setCapturing(false);
  }, []);

  // Start scanner - open camera with high resolution
  const startScanner = useCallback(async () => {
    setScannerOpen(true);
    setScannerDebug('מפעיל מצלמה...');

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
      setScannerDebug(`${s.width}x${s.height} | לחץ על כפתור הצילום`);

      // Also run ZXing continuous scanning in background
      if (videoRef.current) {
        try {
          const controls = await zxingReader.decodeFromVideoDevice(
            undefined,
            videoRef.current,
            (result) => {
              if (result) {
                const code = result.getText();
                setScannerDebug(`זוהה אוטומטית: "${code}"`);
                stopScanner();
                handleBarcodeDetected(code);
              }
            },
          );
          controlsRef.current = controls;
        } catch {
          // If ZXing continuous fails, manual capture still works
          setScannerDebug(`${s.width}x${s.height} | לחץ על כפתור הצילום`);
        }
      }
    } catch (err: any) {
      setScannerOpen(false);
      setSnackbar({ message: `שגיאת מצלמה: ${err?.message || err}`, severity: 'error' });
    }
  }, [stopScanner, handleBarcodeDetected]);

  // Manual capture - take a high-res photo and decode it
  const captureAndDecode = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    setCapturing(true);
    setScannerDebug('מעבד תמונה...');

    try {
      // Method 1: Try ImageCapture API for highest quality photo
      const stream = video.srcObject as MediaStream;
      const track = stream?.getVideoTracks()[0];
      let decoded = false;

      if (track && 'ImageCapture' in window) {
        try {
          const imageCapture = new (window as any).ImageCapture(track);
          const bitmap = await imageCapture.grabFrame();

          // Draw bitmap to canvas
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();

          // Convert to blob and decode with ZXing
          const blob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b!), 'image/png')
          );
          const url = URL.createObjectURL(blob);

          try {
            const result = await zxingReader.decodeFromImageUrl(url);
            if (result) {
              const code = result.getText();
              setScannerDebug(`ImageCapture: "${code}"`);
              decoded = true;
              stopScanner();
              handleBarcodeDetected(code);
            }
          } catch { /* no barcode found */ }
          URL.revokeObjectURL(url);
        } catch { /* ImageCapture failed, try canvas method */ }
      }

      // Method 2: Canvas capture from video frame
      if (!decoded) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0);

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/png')
        );
        const url = URL.createObjectURL(blob);

        try {
          const result = await zxingReader.decodeFromImageUrl(url);
          if (result) {
            const code = result.getText();
            setScannerDebug(`Canvas: "${code}"`);
            decoded = true;
            stopScanner();
            handleBarcodeDetected(code);
          }
        } catch { /* no barcode found */ }
        URL.revokeObjectURL(url);
      }

      if (!decoded) {
        setScannerDebug('לא זוהה ברקוד - נסה להתקרב ולחץ שוב');
        setSnackbar({ message: 'לא זוהה ברקוד. התקרב ונסה שוב.', severity: 'info' });
      }
    } catch (err: any) {
      setScannerDebug(`שגיאה: ${err?.message || err}`);
    }

    setCapturing(false);
  }, [stopScanner, handleBarcodeDetected]);

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
        </Box>

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
              <Typography color="white" fontWeight="bold" fontSize={14}>כוון את הברקוד ולחץ על הכפתור</Typography>
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

          {/* Big capture button at bottom */}
          <Box sx={{
            position: 'absolute', bottom: 40, left: 0, right: 0, zIndex: 10,
            display: 'flex', justifyContent: 'center',
          }}>
            <IconButton
              onClick={captureAndDecode}
              disabled={capturing}
              sx={{
                width: 80, height: 80,
                bgcolor: 'rgba(255,255,255,0.9)',
                '&:hover': { bgcolor: 'white' },
                '&:active': { transform: 'scale(0.9)' },
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              }}
            >
              {capturing
                ? <CircularProgress size={40} />
                : <CameraIcon sx={{ fontSize: 40, color: '#333' }} />
              }
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
