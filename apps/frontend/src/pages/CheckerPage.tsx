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
} from '@mui/icons-material';
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const scannerRef = useRef<HTMLDivElement | null>(null);
  const quaggaRunning = useRef(false);

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

  // Stop Quagga live scanner
  const stopScanner = useCallback(() => {
    if (quaggaRunning.current) {
      Quagga.offDetected();
      Quagga.stop();
      quaggaRunning.current = false;
    }
    setScannerOpen(false);
    setTorchOn(false);
    setHasTorch(false);
  }, []);

  // Start Quagga live scanner
  const startScanner = useCallback(() => {
    setScannerOpen(true);
  }, []);

  // Initialize Quagga when scanner dialog opens and the ref is available
  useEffect(() => {
    if (!scannerOpen || !scannerRef.current) return;

    const target = scannerRef.current;

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target,
          constraints: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        decoder: {
          readers: ['code_128_reader', 'code_39_reader', 'ean_reader', 'ean_8_reader'],
        },
        locate: true,
        locator: { patchSize: 'medium', halfSample: false },
        frequency: 10,
      },
      (err) => {
        if (err) {
          // Camera failed (probably HTTP) - fall back to file input
          setScannerOpen(false);
          fileInputRef.current?.click();
          return;
        }
        Quagga.start();
        quaggaRunning.current = true;

        // Check if torch is available
        const track = Quagga.CameraAccess.getActiveTrack();
        if (track) {
          const caps = track.getCapabilities?.() as any;
          if (caps?.torch) setHasTorch(true);
        }
      },
    );

    const onDetected = (result: any) => {
      const code = result?.codeResult?.code;
      if (!code) return;
      // Stop scanning and use the result
      stopScanner();
      handleBarcodeDetected(code);
    };

    Quagga.onDetected(onDetected);

    return () => {
      if (quaggaRunning.current) {
        Quagga.offDetected();
        Quagga.stop();
        quaggaRunning.current = false;
      }
    };
  }, [scannerOpen, stopScanner, handleBarcodeDetected]);

  // Toggle torch/flashlight
  const toggleTorch = useCallback(() => {
    const track = Quagga.CameraAccess.getActiveTrack();
    if (track) {
      const newState = !torchOn;
      (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    }
  }, [torchOn]);

  // File input fallback for when camera is not available (HTTP)
  const handleScanCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);

    try {
      const src = URL.createObjectURL(file);
      // Try multiple settings for best detection
      const settings = [
        { patch: 'medium', half: false },
        { patch: 'large', half: false },
        { patch: 'small', half: true },
      ];

      let result: string | null = null;
      for (const s of settings) {
        result = await new Promise<string | null>((resolve) => {
          Quagga.decodeSingle(
            {
              src,
              numOfWorkers: 0,
              inputStream: { size: 2400 },
              decoder: { readers: ['code_128_reader', 'code_39_reader', 'ean_reader', 'ean_8_reader'] },
              locate: true,
              locator: { patchSize: s.patch, halfSample: s.half },
            },
            (res) => resolve(res?.codeResult?.code || null),
          );
        });
        if (result) break;
      }

      URL.revokeObjectURL(src);

      if (result) {
        handleBarcodeDetected(result);
      } else {
        setSnackbar({ message: 'לא זוהה ברקוד. נסה שוב עם תאורה טובה.', severity: 'error' });
      }
    } catch (err: any) {
      setSnackbar({ message: `שגיאה: ${err?.message || err}`, severity: 'error' });
    }

    setScanning(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Fetch orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['checker-orders', searchQuery, statusFilter, selectedDate],
    queryFn: () => checkerApi.searchOrders(searchQuery || undefined, statusFilter, selectedDate || undefined),
  });

  // Fetch order lines when an order is selected
  const { data: orderDetail, isLoading: linesLoading } = useQuery({
    queryKey: ['checker-lines', selectedOrder],
    queryFn: () => checkerApi.getOrderLines(selectedOrder!),
    enabled: !!selectedOrder,
  });

  // Toggle line check
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
    onError: () => {
      setSnackbar({ message: 'שגיאה בעדכון', severity: 'error' });
    },
  });

  const handleSearch = () => {
    setSearchQuery(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

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
          <IconButton color="inherit" size="small" onClick={logout}>
            <LogoutIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Search + Filters */}
      <Box sx={{ p: 2 }}>
        {/* Date picker */}
        <TextField
          type="date"
          size="small"
          fullWidth
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          sx={{ mb: 1.5, bgcolor: 'white', borderRadius: 1 }}
          InputLabelProps={{ shrink: true }}
          label="תאריך"
        />

        {/* Search bar + scan button */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField
            fullWidth
            placeholder="חפש לפי מספר הזמנה, שם לקוח, טלפון..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            size="medium"
            sx={{ bgcolor: 'white', borderRadius: 1, '& .MuiInputBase-root': { height: 48 } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={handleSearch} edge="end">
                    <SearchIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            onClick={startScanner}
            sx={{ minWidth: 48, height: 48, p: 0 }}
            color="primary"
            disabled={scanning}
          >
            {scanning ? <CircularProgress size={24} color="inherit" /> : <ScannerIcon />}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleScanCapture}
            style={{ display: 'none' }}
          />
        </Box>

        {/* Status filter */}
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          onChange={(_, val) => val && setStatusFilter(val)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        >
          <ToggleButton value="all">הכל</ToggleButton>
          <ToggleButton value="unchecked">לא נבדק</ToggleButton>
          <ToggleButton value="checked">נבדק</ToggleButton>
        </ToggleButtonGroup>

        {/* Results count */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {ordersLoading ? 'טוען...' : `${orders.length} הזמנות`}
        </Typography>
      </Box>

      {/* Orders List */}
      <Box sx={{ px: 2, pb: 2 }}>
        {ordersLoading && <LinearProgress />}
        {orders.map((order: CheckerOrder) => (
          <Card
            key={order.id}
            sx={{
              mb: 1.5,
              cursor: 'pointer',
              border: order.isFullyChecked ? '2px solid #4caf50' : '1px solid #e0e0e0',
              bgcolor: order.isFullyChecked ? '#f1f8e9' : 'white',
              '&:active': { transform: 'scale(0.98)' },
            }}
            onClick={() => setSelectedOrder(order.id)}
          >
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {order.orderNumber}
                </Typography>
                <Chip
                  size="small"
                  label={order.isFullyChecked ? 'נבדק' : 'לא נבדק'}
                  color={order.isFullyChecked ? 'success' : 'default'}
                  variant={order.isFullyChecked ? 'filled' : 'outlined'}
                />
              </Box>
              <Typography variant="body2">{order.customerName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {order.city} | {formatDate(order.deliveryDate)}
                {order.department ? ` | ${DEPT_LABELS[order.department] || order.department}` : ''}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={order.totalLines > 0 ? (order.checkedLines / order.totalLines) * 100 : 0}
                  sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                  color={order.isFullyChecked ? 'success' : 'primary'}
                />
                <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 50, textAlign: 'left' }}>
                  {order.checkedLines}/{order.totalLines}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
        {!ordersLoading && orders.length === 0 && (
          <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
            לא נמצאו הזמנות
          </Typography>
        )}
      </Box>

      {/* Order Lines Dialog */}
      <Dialog
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        fullScreen
        PaperProps={{ sx: { bgcolor: '#f5f5f5' } }}
      >
        {/* Dialog Header */}
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
          <IconButton color="inherit" onClick={() => setSelectedOrder(null)} edge="start">
            <ArrowBackIcon />
          </IconButton>
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

          {/* All checked banner */}
          {allChecked && orderDetail && orderDetail.orderLines.length > 0 && (
            <Alert severity="success" sx={{ mb: 2, fontSize: 16 }} icon={<CheckCircleIcon />}>
              כל השורות נבדקו!
            </Alert>
          )}

          {/* Order info */}
          {orderDetail && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'white', borderRadius: 1 }}>
              <Typography variant="body2"><strong>כתובת:</strong> {orderDetail.address}, {orderDetail.city}</Typography>
              <Typography variant="body2"><strong>טלפון:</strong> {orderDetail.phone}</Typography>
              <Typography variant="body2"><strong>תאריך:</strong> {formatDate(orderDetail.deliveryDate)}</Typography>
            </Box>
          )}

          <Divider sx={{ mb: 2 }} />

          {/* Lines list */}
          {orderDetail?.orderLines.map((line) => (
            <Card
              key={line.id}
              sx={{
                mb: 1,
                border: line.checkedByInspector ? '2px solid #4caf50' : '1px solid #e0e0e0',
                bgcolor: line.checkedByInspector ? '#f1f8e9' : 'white',
              }}
            >
              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 }, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  checked={line.checkedByInspector}
                  onChange={() => toggleMutation.mutate({ lineId: line.id, checked: !line.checkedByInspector })}
                  sx={{ '& .MuiSvgIcon-root': { fontSize: 32 } }}
                  icon={<UncheckedIcon sx={{ fontSize: 32, color: '#bdbdbd' }} />}
                  checkedIcon={<CheckCircleIcon sx={{ fontSize: 32, color: '#4caf50' }} />}
                />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body1" fontWeight="bold" noWrap>
                    {line.product}
                  </Typography>
                  {line.description && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {line.description}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    כמות: {line.quantity} | משקל: {line.weight} ק"ג
                  </Typography>
                </Box>
                <Typography variant="h6" color="text.secondary" sx={{ minWidth: 30, textAlign: 'center' }}>
                  {line.lineNumber}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </DialogContent>
      </Dialog>

      {/* Live Scanner Dialog */}
      <Dialog
        open={scannerOpen}
        onClose={stopScanner}
        fullScreen
        PaperProps={{ sx: { bgcolor: 'black', overflow: 'hidden' } }}
      >
        {/* Camera viewfinder - must be first, fills entire dialog */}
        <Box
          ref={scannerRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            '& video': {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            },
            '& canvas': {
              display: 'none',
            },
          }}
        />

        {/* Scanner header */}
        <Box sx={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          p: 1, bgcolor: 'rgba(0,0,0,0.6)',
        }}>
          <IconButton onClick={stopScanner} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
          <Typography color="white" fontWeight="bold">כוון את הברקוד למסגרת</Typography>
          {hasTorch ? (
            <IconButton onClick={toggleTorch} sx={{ color: torchOn ? '#ffc107' : 'white' }}>
              {torchOn ? <FlashOnIcon /> : <FlashOffIcon />}
            </IconButton>
          ) : <Box sx={{ width: 48 }} />}
        </Box>

        {/* Scan guide overlay */}
        <Box sx={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%', height: 120, zIndex: 10,
          border: '2px solid rgba(255,255,255,0.7)',
          borderRadius: 2,
          pointerEvents: 'none',
        }}>
          {/* Laser line animation */}
          <Box sx={{
            position: 'absolute', top: '50%', left: 8, right: 8,
            height: 2, bgcolor: '#ff1744',
            animation: 'scanline 2s ease-in-out infinite',
            '@keyframes scanline': {
              '0%, 100%': { transform: 'translateY(-25px)', opacity: 0.7 },
              '50%': { transform: 'translateY(25px)', opacity: 1 },
            },
          }} />
        </Box>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
