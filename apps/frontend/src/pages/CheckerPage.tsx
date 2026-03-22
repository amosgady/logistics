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
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Logout as LogoutIcon,
  QrCodeScanner as ScannerIcon,
  Close as CloseIcon,
  FlashlightOn as FlashOnIcon,
  FlashlightOff as FlashOffIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { checkerApi, CheckerOrder, CheckerOrderDetail } from '../services/checkerApi';
import { addToQueue } from '../services/offlineQueue';
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
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        if (state === 2 /* SCANNING */ || state === 3 /* PAUSED */) {
          await html5QrCodeRef.current.stop();
        }
      } catch { /* */ }
      html5QrCodeRef.current = null;
    }
    setScannerOpen(false);
    setTorchOn(false);
    setHasTorch(false);
  }, []);

  // Start scanner using html5-qrcode library
  const startScanner = useCallback(async () => {
    setScannerOpen(true);

    // Wait for the scanner div to render
    await new Promise((r) => setTimeout(r, 500));

    try {
      const scannerDiv = document.getElementById('html5-qrcode-scanner');
      if (!scannerDiv) return;

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
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });
      html5QrCodeRef.current = html5QrCode;

      let found = false;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const w = Math.floor(viewfinderWidth * 0.9);
            const h = Math.floor(viewfinderHeight * 0.3);
            return { width: w, height: h };
          },
          disableFlip: false,
          videoConstraints: {
            facingMode: { exact: 'environment' },
            width: { min: 1280, ideal: 1920 },
            height: { min: 720, ideal: 1080 },
          },
        },
        (decodedText: string) => {
          if (found) return;
          found = true;
          html5QrCode.stop().catch(() => {}).then(() => {
            html5QrCodeRef.current = null;
            setScannerOpen(false);
            handleBarcodeDetected(decodedText);
          });
        },
        () => { /* scan attempt failed — normal, keep scanning */ },
      );

      // Apply zoom and continuous focus after start
      try {
        const videoElem = scannerDiv.querySelector('video');
        if (videoElem && videoElem.srcObject) {
          const track = (videoElem.srcObject as MediaStream).getVideoTracks()[0];
          const caps = track?.getCapabilities?.() as any;
          if (caps?.zoom) {
            const targetZoom = Math.min(2.0, caps.zoom.max);
            await track.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
          }
          if (caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
          }
          if (caps?.torch) setHasTorch(true);
        }
      } catch { /* */ }
    } catch (err: any) {
      setSnackbar({ message: `שגיאה בהפעלת סורק: ${err?.message || err}`, severity: 'error' });
      setScannerOpen(false);
    }
  }, [handleBarcodeDetected]);

  // Toggle torch
  const toggleTorch = useCallback(() => {
    const scannerDiv = document.getElementById('html5-qrcode-scanner');
    const video = scannerDiv?.querySelector('video');
    const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
    if (track) {
      const newState = !torchOn;
      (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    }
  }, [torchOn]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        try { html5QrCodeRef.current.stop(); } catch { /* */ }
      }
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
    onError: (_err, variables) => {
      if (!navigator.onLine) {
        addToQueue({ type: 'checker-toggle', endpoint: `/checker/lines/${variables.lineId}/check`, method: 'PATCH', data: { checked: variables.checked } });
        setSnackbar({ message: 'אין חיבור - הבדיקה תישמר כשהחיבור יחזור', severity: 'warning' });
      } else {
        setSnackbar({ message: 'שגיאה בעדכון', severity: 'error' });
      }
    },
  });

  const noteMutation = useMutation({
    mutationFn: ({ orderId, checkerNote }: { orderId: number; checkerNote: string }) =>
      checkerApi.updateCheckerNote(orderId, checkerNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checker-lines', selectedOrder] });
    },
    onError: (_err, variables) => {
      if (!navigator.onLine) {
        addToQueue({ type: 'checker-note', endpoint: `/checker/orders/${variables.orderId}/checker-note`, method: 'PATCH', data: { checkerNote: variables.checkerNote } });
        setSnackbar({ message: 'אין חיבור - ההערה תישמר כשהחיבור יחזור', severity: 'warning' });
      } else {
        setSnackbar({ message: 'שגיאה בשמירת הערה', severity: 'error' });
      }
    },
  });

  const lineNoteMutation = useMutation({
    mutationFn: ({ lineId, checkerNote }: { lineId: number; checkerNote: string }) =>
      checkerApi.updateLineCheckerNote(lineId, checkerNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checker-lines', selectedOrder] });
    },
    onError: (_err, variables) => {
      if (!navigator.onLine) {
        addToQueue({ type: 'checker-line-note', endpoint: `/checker/lines/${variables.lineId}/checker-note`, method: 'PATCH', data: { checkerNote: variables.checkerNote } });
        setSnackbar({ message: 'אין חיבור - ההערה תישמר כשהחיבור יחזור', severity: 'warning' });
      } else {
        setSnackbar({ message: 'שגיאה בשמירת הערת שורה', severity: 'error' });
      }
    },
  });

  const palletMutation = useMutation({
    mutationFn: ({ orderId, palletCount }: { orderId: number; palletCount: number }) =>
      checkerApi.updateOrderPalletCount(orderId, palletCount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checker-lines', selectedOrder] });
      setSnackbar({ message: 'כמות משטחים עודכנה', severity: 'success' });
    },
    onError: (_err, variables) => {
      if (!navigator.onLine) {
        addToQueue({ type: 'checker-pallet', endpoint: `/checker/orders/${variables.orderId}/pallet-count`, method: 'PATCH', data: { palletCount: variables.palletCount } });
        setSnackbar({ message: 'אין חיבור - העדכון יישמר כשהחיבור יחזור', severity: 'warning' });
      } else {
        setSnackbar({ message: 'שגיאה בעדכון משטחים', severity: 'error' });
      }
    },
  });

  const countsMutation = useMutation({
    mutationFn: ({ orderId, counts }: { orderId: number; counts: Record<string, number | null> }) =>
      checkerApi.updateOrderCounts(orderId, counts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checker-lines', selectedOrder] });
    },
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5, bgcolor: 'white', borderRadius: 1, py: 0.5 }}>
          <IconButton onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }}>
            <ChevronRightIcon />
          </IconButton>
          <Typography variant="body1" fontWeight="bold" sx={{ mx: 2, minWidth: 100, textAlign: 'center' }}>
            {selectedDate === getTodayDate() ? 'היום' : formatDate(selectedDate)}
          </Typography>
          <IconButton onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }}>
            <ChevronLeftIcon />
          </IconButton>
        </Box>

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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography variant="body2"><strong>משטחים:</strong></Typography>
                <TextField
                  type="number"
                  size="small"
                  defaultValue={orderDetail.palletCount}
                  key={`pallet-${orderDetail.id}-${orderDetail.palletCount}`}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 0 && val !== orderDetail.palletCount) {
                      palletMutation.mutate({ orderId: orderDetail.id, palletCount: val });
                    }
                  }}
                  inputProps={{ min: 0, style: { textAlign: 'center', width: 50, padding: '4px 8px' } }}
                  sx={{ bgcolor: '#fff' }}
                />
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                {[
                  { key: 'faucetCount', label: 'ברזים' },
                  { key: 'bathtubCount', label: 'אמבטיות' },
                  { key: 'panelCount', label: 'פאנל' },
                  { key: 'showerCount', label: 'מקלחונים' },
                  { key: 'rodCount', label: 'מוטות' },
                  { key: 'cabinetCount', label: 'ארונות' },
                ].map(({ key, label }) => (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2"><strong>{label}:</strong></Typography>
                    <TextField
                      type="number"
                      size="small"
                      defaultValue={(orderDetail as any)[key] ?? ''}
                      key={`${key}-${orderDetail.id}-${(orderDetail as any)[key]}`}
                      onBlur={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        if (val !== ((orderDetail as any)[key] ?? null)) {
                          countsMutation.mutate({ orderId: orderDetail.id, counts: { [key]: val } });
                        }
                      }}
                      inputProps={{ min: 0, style: { textAlign: 'center', width: 40, padding: '4px 8px' } }}
                      sx={{ bgcolor: '#fff' }}
                    />
                  </Box>
                ))}
              </Box>
              {orderDetail.driverNote && (
                <Alert severity="info" sx={{ mt: 1, py: 0.5 }} icon={false}>
                  <Typography variant="body2"><strong>הערה:</strong> {orderDetail.driverNote}</Typography>
                </Alert>
              )}
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                label="הערת בודק"
                placeholder="כתוב הערה..."
                defaultValue={orderDetail.checkerNote || ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val !== (orderDetail.checkerNote || '')) {
                    noteMutation.mutate({ orderId: orderDetail.id, checkerNote: val });
                  }
                }}
                sx={{ mt: 1.5, bgcolor: '#fff' }}
                size="small"
              />
              <Button
                variant="outlined"
                startIcon={<PrintIcon />}
                sx={{ mt: 1.5 }}
                fullWidth
                onClick={() => {
                  const od = orderDetail;
                  const totalItems = (od.palletCount || 0) + (od.faucetCount || 0) + (od.bathtubCount || 0) +
                    (od.panelCount || 0) + (od.showerCount || 0) + (od.rodCount || 0) + (od.cabinetCount || 0);
                  const count = Math.max(totalItems, 1);
                  const labels = Array.from({ length: count }, (_, i) => i + 1);

                  const pw = window.open('', '_blank');
                  if (!pw) return;
                  const barcodeValue = (idx: number) => `${od.orderNumber}-${idx}`;
                  pw.document.write(`
                    <html dir="rtl"><head><title>מדבקות - ${od.orderNumber}</title>
                    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
                    <style>
                      @page { size: 100mm 100mm; margin: 0; }
                      body { margin: 0; font-family: Arial, sans-serif; }
                      .label { width: 100mm; height: 100mm; box-sizing: border-box; padding: 6mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
                      .label:last-child { page-break-after: avoid; }
                      .customer { font-size: 18pt; font-weight: bold; margin-bottom: 3mm; }
                      .address { font-size: 14pt; margin-bottom: 2mm; }
                      .phone { font-size: 14pt; margin-bottom: 2mm; }
                      .order { font-size: 12pt; margin-bottom: 2mm; color: #555; }
                      .barcode { margin: 2mm 0; }
                      .barcode svg { height: 15mm; }
                      .pallet { font-size: 20pt; font-weight: bold; margin-top: 2mm; color: #1976d2; }
                      @media print { .label { border: none; } }
                    </style></head><body>
                    ${labels.map(i => `
                      <div class="label">
                        <div class="customer">${od.customerName}</div>
                        <div class="address">${od.address}, ${od.city}</div>
                        <div class="phone">טל: ${od.phone}</div>
                        <div class="order">הזמנה: ${od.orderNumber}</div>
                        <div class="barcode"><svg class="barcode-${i}"></svg></div>
                        <div class="pallet">משטח ${i}/${count}</div>
                      </div>
                    `).join('')}
                    <script>
                      ${labels.map(i => `JsBarcode('.barcode-${i}', '${barcodeValue(i)}', { format: 'CODE128', width: 2, height: 40, displayValue: true, fontSize: 12 });`).join('\n')}
                    <\/script>
                    </body></html>
                  `);
                  pw.document.close();
                  pw.print();
                }}
              >
                הדפסת מדבקות ({(() => {
                  const od = orderDetail;
                  const total = (od.palletCount || 0) + (od.faucetCount || 0) + (od.bathtubCount || 0) +
                    (od.panelCount || 0) + (od.showerCount || 0) + (od.rodCount || 0) + (od.cabinetCount || 0);
                  return Math.max(total, 1);
                })()})
              </Button>
            </Box>
          )}
          <Divider sx={{ mb: 2 }} />
          {orderDetail?.orderLines.map((line) => (
            <Card key={line.id} sx={{
              mb: 1, border: line.checkedByInspector ? '2px solid #4caf50' : '1px solid #e0e0e0',
              bgcolor: line.checkedByInspector ? '#f1f8e9' : 'white',
            }}>
              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox checked={line.checkedByInspector}
                    onChange={() => toggleMutation.mutate({ lineId: line.id, checked: !line.checkedByInspector })}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 32 } }}
                    icon={<UncheckedIcon sx={{ fontSize: 32, color: '#bdbdbd' }} />}
                    checkedIcon={<CheckCircleIcon sx={{ fontSize: 32, color: '#4caf50' }} />} />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight="bold" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{line.product}</Typography>
                    {line.description && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{line.description}</Typography>}
                    <Typography variant="body2" color="text.secondary">כמות: {line.quantity} | משקל: {line.weight} ק"ג</Typography>
                  </Box>
                  <Typography variant="h6" color="text.secondary" sx={{ minWidth: 30, textAlign: 'center' }}>{line.lineNumber}</Typography>
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="הערת בודק לשורה..."
                  defaultValue={line.checkerNote || ''}
                  key={`line-note-${line.id}-${line.checkerNote}`}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== (line.checkerNote || '')) {
                      lineNoteMutation.mutate({ lineId: line.id, checkerNote: val });
                    }
                  }}
                  sx={{ mt: 0.5, ml: 5, bgcolor: '#fff', '& .MuiInputBase-input': { py: 0.5, fontSize: '0.85rem' } }}
                />
              </CardContent>
            </Card>
          ))}
        </DialogContent>
      </Dialog>

      {/* Scanner - Full screen overlay */}
      {scannerOpen && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, bgcolor: 'black', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Box sx={{
            position: 'absolute', top: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            p: 1, bgcolor: 'rgba(0,0,0,0.85)', zIndex: 99999,
          }}>
            <IconButton onClick={stopScanner} sx={{ color: 'white' }}><CloseIcon /></IconButton>
            <Typography color="white" fontWeight="bold" fontSize={14}>כוון ברקוד למסגרת</Typography>
            {hasTorch ? (
              <IconButton onClick={toggleTorch} sx={{ color: torchOn ? '#ffc107' : 'white' }}>
                {torchOn ? <FlashOnIcon /> : <FlashOffIcon />}
              </IconButton>
            ) : <Box sx={{ width: 40 }} />}
          </Box>

          {/* html5-qrcode scanner container */}
          <Box id="html5-qrcode-scanner" sx={{
            width: '100%', height: '100%',
            '& video': { objectFit: 'cover !important' },
            '& #qr-shaded-region': { borderColor: '#ff1744 !important' },
          }} />

          {/* Bottom bar */}
          <Box sx={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            p: 1.5, bgcolor: 'rgba(0,0,0,0.85)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
          }}>
            <CircularProgress size={18} sx={{ color: '#4caf50' }} />
            <Typography color="white" fontSize={13}>סורק...</Typography>
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
