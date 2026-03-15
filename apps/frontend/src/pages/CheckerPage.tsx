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
import { Html5Qrcode } from 'html5-qrcode';
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const lastReadRef = useRef<string>('');
  const readCountRef = useRef<number>(0);

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
    try {
      if (html5QrRef.current) {
        const state = html5QrRef.current.getState();
        // State 2 = SCANNING, 3 = PAUSED
        if (state === 2 || state === 3) {
          await html5QrRef.current.stop();
        }
        html5QrRef.current.clear();
        html5QrRef.current = null;
      }
    } catch {
      // ignore cleanup errors
    }
    setScannerOpen(false);
    setTorchOn(false);
    setHasTorch(false);
    lastReadRef.current = '';
    readCountRef.current = 0;
  }, []);

  // Start scanner
  const startScanner = useCallback(async () => {
    setScannerOpen(true);
    lastReadRef.current = '';
    readCountRef.current = 0;

    // Wait for DOM element to exist
    await new Promise((r) => setTimeout(r, 400));

    try {
      const html5Qr = new Html5Qrcode('scanner-region');
      html5QrRef.current = html5Qr;

      // Get cameras and pick back camera
      const cameras = await Html5Qrcode.getCameras();
      let cameraId = cameras[0]?.id;
      // Prefer back/environment camera
      const backCam = cameras.find((c) =>
        /back|rear|environment/i.test(c.label)
      );
      if (backCam) cameraId = backCam.id;

      if (!cameraId) {
        setSnackbar({ message: 'לא נמצאה מצלמה', severity: 'error' });
        setScannerOpen(false);
        return;
      }

      await html5Qr.start(
        cameraId,
        {
          fps: 15,
          qrbox: { width: 300, height: 150 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          // Validate barcode format
          if (!/^T-\d+-\d+$/.test(decodedText) && !/^\d{6,}$/.test(decodedText)) return;

          // Require 2 consecutive identical reads
          if (decodedText === lastReadRef.current) {
            readCountRef.current++;
          } else {
            lastReadRef.current = decodedText;
            readCountRef.current = 1;
          }

          if (readCountRef.current >= 2) {
            // Stop and report
            html5Qr.stop().then(() => {
              html5Qr.clear();
              html5QrRef.current = null;
              setScannerOpen(false);
              handleBarcodeDetected(decodedText);
            }).catch(() => {
              setScannerOpen(false);
              handleBarcodeDetected(decodedText);
            });
          }
        },
        () => {
          // QR code not found in this frame - ignore
        },
      );

      // Check torch support
      try {
        const track = html5Qr.getRunningTrackSettings();
        if (track && (track as any).torch !== undefined) {
          setHasTorch(true);
        }
      } catch {
        // Some browsers don't support getRunningTrackSettings
      }

      // Also check via getCapabilities
      try {
        const caps = html5Qr.getRunningTrackCameraCapabilities();
        const torchFeature = caps?.torchFeature as any;
        if (torchFeature?.isSupported?.()) {
          setHasTorch(true);
        }
      } catch {
        // ignore
      }
    } catch (err: any) {
      console.error('Scanner error:', err);
      setScannerOpen(false);
      setSnackbar({ message: `שגיאת מצלמה: ${err?.message || err}`, severity: 'error' });
    }
  }, [handleBarcodeDetected]);

  // Toggle torch
  const toggleTorch = useCallback(async () => {
    try {
      const caps = html5QrRef.current?.getRunningTrackCameraCapabilities();
      const torchFeature = caps?.torchFeature as any;
      if (torchFeature?.isSupported?.()) {
        const newState = !torchOn;
        await torchFeature.apply(newState);
        setTorchOn(newState);
      }
    } catch {
      // ignore
    }
  }, [torchOn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (html5QrRef.current) {
        try {
          const state = html5QrRef.current.getState();
          if (state === 2 || state === 3) {
            html5QrRef.current.stop().catch(() => {});
          }
          html5QrRef.current.clear();
        } catch {
          // ignore
        }
      }
    };
  }, []);

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
          >
            <ScannerIcon />
          </Button>
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

      {/* Live Scanner Dialog - html5-qrcode manages its own video */}
      <Dialog
        open={scannerOpen}
        onClose={stopScanner}
        fullScreen
        PaperProps={{ sx: { bgcolor: 'black', overflow: 'hidden' } }}
      >
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

        {/* Scanner container - html5-qrcode renders video here */}
        <Box
          id="scanner-region"
          sx={{
            width: '100%',
            height: '100%',
            '& video': {
              width: '100% !important',
              height: '100% !important',
              objectFit: 'cover !important',
            },
            // Hide the default scanning region border from html5-qrcode
            '& #qr-shaded-region': {
              borderColor: 'rgba(255,255,255,0.5) !important',
            },
          }}
        />
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
