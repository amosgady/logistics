import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, CardActions,
  Button, Chip, IconButton, Collapse, Alert, Snackbar,
  AppBar, Toolbar, LinearProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, ToggleButtonGroup,
  ToggleButton, Divider, Paper, Badge,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { useDateStore } from '../store/dateStore';
import SignatureCanvas from 'react-signature-canvas';
import {
  Phone as PhoneIcon,
  Navigation as NavIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CompleteIcon,
  Cancel as NotDeliveredIcon,
  RemoveCircle as PartialIcon,
  Logout as LogoutIcon,
  LocalShipping as TruckIcon,
  Build as InstallerIcon,
  Schedule as TimeIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  CameraAlt as CameraIcon,
  Draw as SignatureIcon,
  Close as CloseIcon,
  Photo as PhotoIcon,
  Message as MessageIcon,
  PictureAsPdf as PdfIcon,
  QrCodeScanner as ScannerIcon,
  FlashlightOn as FlashOnIcon,
  FlashlightOff as FlashOffIcon,
  Inventory as LoadIcon,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { driverApi } from '../services/driverApi';
import { installerFieldApi } from '../services/installerFieldApi';
import { trackingApi } from '../services/trackingApi';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { addToQueue } from '../services/offlineQueue';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import DeliveryMediaDialog from '../components/common/DeliveryMediaDialog';
import MessagesDrawer from '../components/tracking/MessagesDrawer';

const DELIVERY_RESULTS = [
  { value: 'COMPLETE', label: 'הושלם', color: 'success' as const, icon: <CompleteIcon /> },
  { value: 'PARTIAL', label: 'חלקי', color: 'warning' as const, icon: <PartialIcon /> },
  { value: 'NOT_DELIVERED', label: 'לא סופק', color: 'error' as const, icon: <NotDeliveredIcon /> },
];

const TIME_WINDOW_LABELS: Record<string, string> = {
  MORNING: 'בוקר 8-12',
  AFTERNOON: 'צהריים 12-16',
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function toDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

interface OrderLine {
  id: number;
  product: string;
  description: string | null;
  quantity: number;
  weight: string;
}

interface DeliveryPhoto {
  id: number;
  photoUrl: string;
}

interface Delivery {
  id: number;
  result: string;
  notes: string | null;
  signatureUrl: string | null;
  deliveredAt: string | null;
  photos: DeliveryPhoto[];
}

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  phone2: string | null;
  contactPerson: string | null;
  floor: number | null;
  elevator: boolean | null;
  status: string;
  timeWindow: string | null;
  estimatedArrival: string | null;
  routeSequence: number | null;
  latitude: number | null;
  longitude: number | null;
  coordinationNotes: string | null;
  driverNote: string | null;
  palletCount: number;
  doorCount: number | null;
  handleCount: number | null;
  faucetCount: number | null;
  bathtubCount: number | null;
  panelCount: number | null;
  showerCount: number | null;
  rodCount: number | null;
  cabinetCount: number | null;
  price: string | null;
  deliveryNoteUrl: string | null;
  signedDeliveryNoteUrl: string | null;
  orderLines: OrderLine[];
  delivery: Delivery | null;
}

interface FieldWorkerPageProps {
  role: 'DRIVER' | 'INSTALLER';
}

export default function FieldWorkerPage({ role }: FieldWorkerPageProps) {
  const isDriver = role === 'DRIVER';
  const apiService = isDriver ? driverApi : installerFieldApi;
  const queryKey = isDriver ? 'driver-route' : 'installer-route';

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { selectedDate: storedDate, setSelectedDate: setStoredDate } = useDateStore();
  const selectedDate = new Date(storedDate + 'T00:00:00');
  const setSelectedDate = useCallback((d: Date) => setStoredDate(toDateString(d)), [setStoredDate]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deliveryDialog, setDeliveryDialog] = useState<{ orderId: number; orderNumber: string; orderLines: OrderLine[] } | null>(null);
  const [deliveryResult, setDeliveryResult] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [viewMediaDialog, setViewMediaDialog] = useState<{ signatureUrl: string | null; photos: DeliveryPhoto[]; orderNumber: string } | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messagePopup, setMessagePopup] = useState<{ sender: string; text: string } | null>(null);
  const [signNoteDialog, setSignNoteDialog] = useState<{ orderId: number; orderNumber: string; deliveryNoteUrl: string; signedDeliveryNoteUrl: string | null } | null>(null);
  const [signNoteHasSig, setSignNoteHasSig] = useState(false);
  const [signingNote, setSigningNote] = useState(false);
  const prevUnreadRef = useRef<number>(0);
  const signatureRef = useRef<SignatureCanvas | null>(null);
  const signNoteRef = useRef<SignatureCanvas | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Scanning state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'LOAD' | 'UNLOAD' | null>(null);
  const [scanOrderId, setScanOrderId] = useState<number | null>(null);
  const [scanMessage, setScanMessage] = useState<{ text: string; severity: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<{ orders: any[]; totalPallets: number; scannedPallets: number } | null>(null);
  const [unloadedOrders, setUnloadedOrders] = useState<Set<number>>(new Set());
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const scanFoundRef = useRef(false);

  // Scanner functions
  const calcTotalPallets = (order: any) =>
    (order.palletCount || 0) + (order.faucetCount || 0) + (order.bathtubCount || 0) +
    (order.panelCount || 0) + (order.showerCount || 0) + (order.rodCount || 0) + (order.cabinetCount || 0);

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        if (state === 2 || state === 3) await html5QrCodeRef.current.stop();
      } catch { /* */ }
      html5QrCodeRef.current = null;
    }
    setScannerOpen(false);
    setTorchOn(false);
    setHasTorch(false);
  }, []);

  const handleScanResult = useCallback(async (barcodeValue: string) => {
    if (!scanMode) return;
    try {
      const res = await driverApi.scanPallet(barcodeValue, scanMode);
      const d = res.data;
      if (d.status === 'ALREADY_SCANNED') {
        setScanMessage({ text: d.message, severity: 'info' });
      } else {
        setScanMessage({ text: d.message, severity: 'success' });
      }
      // Refresh loading status
      if (scanMode === 'LOAD') {
        const ls = await driverApi.getLoadingStatus(toDateString(selectedDate));
        setLoadingStatus(ls.data);
      } else if (scanMode === 'UNLOAD' && scanOrderId) {
        const us = await driverApi.getUnloadingStatus(scanOrderId);
        if (us.data.complete) {
          setUnloadedOrders(prev => new Set([...prev, scanOrderId]));
          setScanMessage({ text: 'הפריקה הושלמה! ✅', severity: 'success' });
          setTimeout(() => stopScanner(), 1500);
          return;
        }
        setScanMessage({ text: `${us.data.scannedPallets}/${us.data.totalPallets} משטחים נסרקו`, severity: 'success' });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'שגיאה בסריקה';
      setScanMessage({ text: msg, severity: 'error' });
    }
    // Continue scanning
    scanFoundRef.current = false;
  }, [scanMode, scanOrderId, selectedDate, stopScanner]);

  const startScanner = useCallback(async (mode: 'LOAD' | 'UNLOAD', orderId?: number) => {
    setScanMode(mode);
    setScanOrderId(orderId || null);
    setScanMessage(null);
    setScannerOpen(true);
    scanFoundRef.current = false;

    if (mode === 'LOAD') {
      try {
        const ls = await driverApi.getLoadingStatus(toDateString(selectedDate));
        setLoadingStatus(ls.data);
      } catch { /* */ }
    }

    await new Promise(r => setTimeout(r, 500));
    const scannerDiv = document.getElementById('driver-scanner');
    if (!scannerDiv) return;
    scannerDiv.innerHTML = '';

    const html5QrCode = new Html5Qrcode('driver-scanner', {
      formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.EAN_13],
      verbose: false,
    });
    html5QrCodeRef.current = html5QrCode;

    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (vw, vh) => ({ width: Math.floor(vw * 0.9), height: Math.floor(vh * 0.3) }),
        },
        (decodedText: string) => {
          if (scanFoundRef.current) return;
          scanFoundRef.current = true;
          handleScanResult(decodedText);
        },
        () => {},
      );
      const videoElem = scannerDiv.querySelector('video');
      if (videoElem) {
        const track = (videoElem.srcObject as MediaStream)?.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as any;
        if (caps?.zoom) await track.applyConstraints({ advanced: [{ zoom: Math.min(2.0, caps.zoom.max) } as any] });
        if (caps?.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
        if (caps?.torch) setHasTorch(true);
      }
    } catch { setScannerOpen(false); }
  }, [selectedDate, handleScanResult]);

  const toggleTorch = useCallback(() => {
    const video = document.getElementById('driver-scanner')?.querySelector('video');
    const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
    if (track) {
      const newState = !torchOn;
      (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    }
  }, [torchOn]);

  const handleFinishLoading = useCallback(async () => {
    try {
      const ls = await driverApi.getLoadingStatus(toDateString(selectedDate));
      const data = ls.data;
      setLoadingStatus(data);
      const missing: string[] = [];
      for (const o of data.orders) {
        for (let i = 1; i <= o.totalPallets; i++) {
          if (o.scannedPallets < i) {
            missing.push(`הזמנה ${o.orderNumber} משטח ${i}/${o.totalPallets}`);
          }
        }
      }
      if (missing.length > 0) {
        const missingCount = data.totalPallets - data.scannedPallets;
        setScanMessage({ text: `חסרים ${missingCount} משטחים:\n${missing.slice(0, 5).join('\n')}${missing.length > 5 ? `\n...ועוד ${missing.length - 5}` : ''}`, severity: 'warning' });
      } else {
        setScanMessage({ text: 'כל המשטחים נסרקו בהצלחה! ✅', severity: 'success' });
        setTimeout(() => { stopScanner(); setScanMode(null); }, 2000);
      }
    } catch {
      setScanMessage({ text: 'שגיאה בבדיקת סטטוס', severity: 'error' });
    }
  }, [selectedDate, stopScanner]);

  // Recover pending deliveries from localStorage (in case app was killed mid-submission)
  useEffect(() => {
    if (!navigator.onLine) return;
    const pendingKeys = Object.keys(localStorage).filter((k) => k.startsWith('pending_delivery_'));
    pendingKeys.forEach(async (key) => {
      try {
        const pending = JSON.parse(localStorage.getItem(key) || '{}');
        if (!pending.orderId || Date.now() - pending.timestamp > 24 * 60 * 60 * 1000) {
          localStorage.removeItem(key);
          return;
        }
        addToQueue({ type: 'delivery', endpoint: `${pending.basePath}/orders/${pending.orderId}/delivery`, method: 'POST', data: pending.deliveryData });
        if (pending.signatureData) {
          addToQueue({ type: 'signature', endpoint: `${pending.basePath}/orders/${pending.orderId}/signature`, method: 'POST', data: { signature: pending.signatureData } });
        }
        localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS location reporting
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        trackingApi.reportLocation(position.coords.latitude, position.coords.longitude)
          .catch((err) => console.error('Location report failed:', err));
      },
      (error) => console.error('Geolocation error:', error),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Unread messages count + new message detection
  const { data: unreadData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => trackingApi.getUnreadCount(),
    refetchInterval: 15000,
  });
  const unreadCount = unreadData?.data?.count || 0;

  // When unread count increases, fetch latest message and show popup
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
      trackingApi.getMyMessages().then((res) => {
        const messages = res?.data || [];
        const latest = messages.find((m: any) => !m.isRead);
        if (latest) {
          setMessagePopup({ sender: latest.sender.fullName, text: latest.text });
        }
      }).catch(() => {});
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const isToday = toDateString(selectedDate) === toDateString(new Date());
  const isFutureLimit = toDateString(selectedDate) >= toDateString(addDays(new Date(), 7));

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, toDateString(selectedDate)],
    queryFn: () => apiService.getMyRoute(toDateString(selectedDate)),
    refetchInterval: isToday ? 60000 : false,
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openNavigation = (order: Order) => {
    if (order.latitude && order.longitude) {
      window.open(`https://waze.com/ul?ll=${order.latitude},${order.longitude}&navigate=yes`);
    } else {
      const address = encodeURIComponent(`${order.address}, ${order.city}`);
      window.open(`https://www.google.com/maps/search/?api=1&query=${address}`);
    }
  };

  const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 5 - photoFiles.length;
    const newFiles = files.slice(0, remaining);
    setPhotoFiles((prev) => [...prev, ...newFiles]);
    newFiles.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const handleRemovePhoto = (idx: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDeliverySubmit = async () => {
    if (!deliveryDialog) return;
    setSubmitting(true);
    const orderId = deliveryDialog.orderId;
    const deliveryData = { result: deliveryResult, notes: deliveryNotes || undefined };
    const basePath = isDriver ? '/driver' : '/installer';
    const warnings: string[] = [];

    // Get signature data before closing dialog
    let signatureData: string | null = null;
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      signatureData = signatureRef.current.toDataURL('image/png');
    }

    // Pre-save to localStorage BEFORE attempting API call (in case app is killed mid-flight)
    const pendingKey = `pending_delivery_${orderId}`;
    try {
      localStorage.setItem(pendingKey, JSON.stringify({
        deliveryData,
        signatureData,
        basePath,
        orderId,
        timestamp: Date.now(),
      }));
    } catch { /* localStorage full - proceed without backup */ }

    // Step 1: Record delivery
    try {
      await apiService.recordDelivery(orderId, deliveryData);
      // Success - remove pending backup (delivery sent, signature handled below)
      localStorage.removeItem(pendingKey);
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: 'delivery', endpoint: `${basePath}/orders/${orderId}/delivery`, method: 'POST', data: deliveryData });
        if (signatureData) {
          addToQueue({ type: 'signature', endpoint: `${basePath}/orders/${orderId}/signature`, method: 'POST', data: { signature: signatureData } });
        }
        localStorage.removeItem(pendingKey); // moved to queue
        const photoWarning = photoFiles.length > 0 ? ' (תמונות לא נשמרו - צלם שוב כשיהיה חיבור)' : '';
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        setDeliveryDialog(null);
        setDeliveryResult('');
        setDeliveryNotes('');
        setHasSignature(false);
        setPhotoFiles([]);
        setPhotoPreviews([]);
        setSnackbar({ message: `אין חיבור - הדיווח והחתימה נשמרו ויישלחו כשהחיבור יחזור${photoWarning}`, severity: 'warning' });
        setSubmitting(false);
        return;
      }
      setSnackbar({ message: 'שגיאה בשמירת הדיווח', severity: 'error' });
      setSubmitting(false);
      return;
    }

    // Step 2: Upload signature (separate try/catch so delivery is not lost)
    if (signatureData) {
      try {
        await apiService.uploadSignature(orderId, signatureData);
      } catch {
        addToQueue({ type: 'signature', endpoint: `${basePath}/orders/${orderId}/signature`, method: 'POST', data: { signature: signatureData } });
        warnings.push('החתימה תישלח כשהחיבור ישתפר');
      }
    }

    // Step 3: Upload photos (separate try/catch)
    if (photoFiles.length > 0) {
      try {
        await apiService.uploadPhotos(orderId, photoFiles);
      } catch {
        warnings.push('התמונות לא נשלחו - נסה שוב מאוחר יותר');
      }
    }

    queryClient.invalidateQueries({ queryKey: [queryKey] });
    setDeliveryDialog(null);
    setDeliveryResult('');
    setDeliveryNotes('');
    setHasSignature(false);
    setPhotoFiles([]);
    setPhotoPreviews([]);

    if (warnings.length > 0) {
      setSnackbar({ message: `הדיווח נשמר. ${warnings.join('. ')}`, severity: 'warning' });
    } else {
      setSnackbar({ message: 'הדיווח נשמר בהצלחה', severity: 'success' });
    }
    setSubmitting(false);
  };

  const handleSignDeliveryNote = async () => {
    if (!signNoteDialog || !signNoteRef.current || signNoteRef.current.isEmpty()) return;
    setSigningNote(true);
    try {
      const signatureData = signNoteRef.current.toDataURL('image/png');
      await driverApi.signDeliveryNote(signNoteDialog.orderId, signatureData);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setSignNoteDialog(null);
      setSignNoteHasSig(false);
      setSnackbar({ message: 'החתימה נשמרה בהצלחה על תעודת המשלוח', severity: 'success' });
    } catch {
      setSnackbar({ message: 'שגיאה בשמירת החתימה', severity: 'error' });
    } finally {
      setSigningNote(false);
    }
  };

  const routeData = data?.data;
  const orders: Order[] = routeData?.orders || [];
  const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;
  const remainingCount = orders.length - completedCount;

  // Header subtitle - truck name for driver, department/zone for installer
  const headerSubtitle = isDriver
    ? (routeData?.truck?.name || 'טוען...')
    : (routeData?.installer?.name || 'טוען...');

  // Empty state text
  const emptyIcon = isDriver ? <TruckIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} /> : <InstallerIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />;
  const hasAssignment = isDriver ? routeData?.truck : routeData?.installer;
  const emptyText = hasAssignment
    ? (isToday ? 'אין עבודות להיום' : 'אין עבודות לתאריך זה')
    : (isToday ? 'לא שויכת למסלול היום' : 'לא שויכת למסלול בתאריך זה');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      {/* App Bar */}
      <AppBar position="sticky">
        <Toolbar>
          {isDriver ? <TruckIcon sx={{ ml: 1 }} /> : <InstallerIcon sx={{ ml: 1 }} />}
          <Box sx={{ flexGrow: 1, mr: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {user?.fullName}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {headerSubtitle}
            </Typography>
          </Box>
          <IconButton color="inherit" onClick={() => setMessagesOpen(true)}>
            <Badge badgeContent={unreadCount} color="error">
              <MessageIcon />
            </Badge>
          </IconButton>
          <IconButton color="inherit" onClick={handleLogout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>

        {/* Date navigation strip */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'primary.dark', py: 0.5, gap: 1 }}>
          <IconButton
            size="small"
            color="inherit"
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            disabled={toDateString(selectedDate) <= toDateString(new Date())}
          >
            <ChevronRightIcon />
          </IconButton>
          <Button
            color="inherit"
            size="small"
            onClick={() => setSelectedDate(new Date())}
            sx={{ minWidth: 140, textTransform: 'none' }}
          >
            <Typography variant="body2" fontWeight="bold">
              {isToday
                ? 'היום'
                : `יום ${DAY_NAMES[selectedDate.getDay()]}`}
              {' · '}
              {selectedDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
            </Typography>
          </Button>
          <IconButton
            size="small"
            color="inherit"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            disabled={isFutureLimit}
          >
            <ChevronLeftIcon />
          </IconButton>
        </Box>
      </AppBar>

      {isLoading && <LinearProgress />}

      <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
        {/* Summary */}
        {orders.length > 0 && (
          <Paper sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <Box>
              <Typography variant="h5" fontWeight="bold">{orders.length}</Typography>
              <Typography variant="caption" color="text.secondary">עצירות</Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="h5" fontWeight="bold" color="success.main">{completedCount}</Typography>
              <Typography variant="caption" color="text.secondary">הושלמו</Typography>
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="h5" fontWeight="bold" color="warning.main">{remainingCount}</Typography>
              <Typography variant="caption" color="text.secondary">נותרו</Typography>
            </Box>
          </Paper>
        )}

        {/* Empty state */}
        {!isLoading && orders.length === 0 && (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            {emptyIcon}
            <Typography variant="h6" color="text.secondary">
              {emptyText}
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
              פנה למתאמת לוגיסטיקה לפרטים
            </Typography>
          </Paper>
        )}

        {/* Loading control button - drivers only */}
        {isDriver && orders.length > 0 && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<LoadIcon />}
            onClick={() => startScanner('LOAD')}
            sx={{ mb: 2, py: 1.5, fontSize: '1.1rem', bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' } }}
          >
            בקרת העמסה ({orders.reduce((sum, o) => sum + calcTotalPallets(o), 0)} משטחים)
          </Button>
        )}

        {/* Delivery cards */}
        {orders.map((order, idx) => {
          const isExpanded = expandedId === order.id;
          const isCompleted = order.status === 'COMPLETED';
          const deliveryInfo = order.delivery;

          return (
            <Card
              key={order.id}
              sx={{
                mb: 1.5,
                border: isCompleted ? '2px solid #4caf50' : undefined,
                opacity: isCompleted ? 0.8 : 1,
              }}
            >
              {/* Collapsed - always visible */}
              <CardContent sx={{ pb: 0, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={idx + 1}
                    size="small"
                    color={isCompleted ? 'success' : 'primary'}
                    sx={{ minWidth: 32, fontWeight: 'bold' }}
                  />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {order.customerName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {order.address}, {order.city}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                      <PhoneIcon fontSize="small" color="action" />
                      <Typography variant="body2" component="a" href={`tel:${order.phone}`} onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={{ color: 'primary.main', textDecoration: 'none' }}>
                        {order.phone}
                      </Typography>
                      {order.phone2 && (
                        <>
                          <Typography variant="body2" color="text.secondary">|</Typography>
                          <Typography variant="body2" component="a" href={`tel:${order.phone2}`} onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={{ color: 'primary.main', textDecoration: 'none' }}>
                            {order.phone2}
                          </Typography>
                        </>
                      )}
                    </Box>
                  </Box>
                  {isCompleted && deliveryInfo && (
                    <Chip
                      label={DELIVERY_RESULTS.find((r) => r.value === deliveryInfo.result)?.label || deliveryInfo.result}
                      size="small"
                      color={DELIVERY_RESULTS.find((r) => r.value === deliveryInfo.result)?.color || 'default'}
                    />
                  )}
                  <IconButton size="small">
                    {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
              </CardContent>

              {/* Expanded details */}
              <Collapse in={isExpanded}>
                <CardContent sx={{ pt: 1 }}>
                  <Divider sx={{ mb: 1.5 }} />

                  <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                    הזמנה #{order.orderNumber}
                  </Typography>

                  {(order.floor != null || order.elevator != null || order.contactPerson || order.palletCount > 0 || order.doorCount != null || order.handleCount != null) && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                      {order.floor != null && (
                        <Chip label={`קומה ${order.floor}`} size="small" variant="outlined" />
                      )}
                      {order.elevator != null && (
                        <Chip
                          label={order.elevator ? 'יש מעלית' : 'אין מעלית'}
                          size="small"
                          variant="outlined"
                          color={order.elevator ? 'success' : 'warning'}
                        />
                      )}
                      {order.contactPerson && (
                        <Chip label={`איש קשר: ${order.contactPerson}`} size="small" variant="outlined" />
                      )}
                      {order.palletCount > 0 && (
                        <Chip label={`משטחים: ${order.palletCount}`} size="small" variant="outlined" color="info" />
                      )}
                      {order.doorCount != null && (
                        <Chip label={`דלתות: ${order.doorCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.handleCount != null && (
                        <Chip label={`ידיות: ${order.handleCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.faucetCount != null && order.faucetCount > 0 && (
                        <Chip label={`ברזים: ${order.faucetCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.bathtubCount != null && order.bathtubCount > 0 && (
                        <Chip label={`אמבטיות: ${order.bathtubCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.panelCount != null && order.panelCount > 0 && (
                        <Chip label={`פאנל: ${order.panelCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.showerCount != null && order.showerCount > 0 && (
                        <Chip label={`מקלחונים: ${order.showerCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.rodCount != null && order.rodCount > 0 && (
                        <Chip label={`מוטות: ${order.rodCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.cabinetCount != null && order.cabinetCount > 0 && (
                        <Chip label={`ארונות: ${order.cabinetCount}`} size="small" variant="outlined" color="primary" />
                      )}
                      {order.price && (
                        <Chip label={`מחיר: ${order.price}`} size="small" variant="outlined" color="warning" />
                      )}
                    </Box>
                  )}

                  <Table size="small" sx={{ tableLayout: 'fixed' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>פריט</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>תיאור</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', width: 50 }}>כמות</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {order.orderLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell sx={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{line.product}</TableCell>
                          <TableCell sx={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{line.description || '-'}</TableCell>
                          <TableCell align="center">{line.quantity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    {order.timeWindow && (
                      <Chip
                        icon={<TimeIcon />}
                        label={TIME_WINDOW_LABELS[order.timeWindow] || order.timeWindow}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {order.estimatedArrival && (
                      <Chip
                        label={`הגעה: ${formatTime(order.estimatedArrival)}`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>

                  {order.coordinationNotes && (
                    <Alert severity="info" sx={{ mt: 1.5, py: 0 }}>
                      {order.coordinationNotes}
                    </Alert>
                  )}
                  {order.driverNote && (
                    <Alert severity="warning" sx={{ mt: 1.5, py: 0 }}>
                      <strong>הערה:</strong> {order.driverNote}
                    </Alert>
                  )}
                  {deliveryInfo?.notes && (
                    <Alert severity="success" sx={{ mt: 1.5, py: 0 }}>
                      <strong>הערת דיווח:</strong> {deliveryInfo.notes}
                    </Alert>
                  )}
                </CardContent>

                <CardActions sx={{ px: 2, pb: 2, flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                    <Button
                      href={`tel:${order.phone}`}
                      component="a"
                      startIcon={<PhoneIcon />}
                      variant="outlined"
                      fullWidth
                      size="large"
                    >
                      {order.phone}
                    </Button>
                    {order.phone2 && (
                      <Button
                        href={`tel:${order.phone2}`}
                        component="a"
                        startIcon={<PhoneIcon />}
                        variant="outlined"
                        fullWidth
                        size="large"
                      >
                        {order.phone2}
                      </Button>
                    )}
                    <Button
                      startIcon={<NavIcon />}
                      variant="outlined"
                      fullWidth
                      size="large"
                      onClick={() => openNavigation(order)}
                    >
                      נווט
                    </Button>
                    {order.deliveryNoteUrl && (
                      <Button
                        startIcon={<PdfIcon />}
                        variant="outlined"
                        color={order.signedDeliveryNoteUrl ? 'success' : 'error'}
                        fullWidth
                        size="large"
                        onClick={() => setSignNoteDialog({
                          orderId: order.id,
                          orderNumber: order.orderNumber,
                          deliveryNoteUrl: order.deliveryNoteUrl!,
                          signedDeliveryNoteUrl: order.signedDeliveryNoteUrl,
                        })}
                      >
                        {order.signedDeliveryNoteUrl ? 'תעודה חתומה ✓' : 'תעודת משלוח'}
                      </Button>
                    )}
                  </Box>
                  {!isCompleted && isDriver && calcTotalPallets(order) > 0 && !unloadedOrders.has(order.id) && (
                    <Button
                      startIcon={<ScannerIcon />}
                      variant="outlined"
                      fullWidth
                      size="large"
                      sx={{ mb: 1 }}
                      onClick={() => startScanner('UNLOAD', order.id)}
                    >
                      בקרת פריקה ({calcTotalPallets(order)} משטחים)
                    </Button>
                  )}
                  {!isCompleted && isDriver && unloadedOrders.has(order.id) && (
                    <Alert severity="success" sx={{ mb: 1, py: 0 }}>פריקה הושלמה ✅</Alert>
                  )}
                  {!isCompleted && (
                    <Button
                      startIcon={<CompleteIcon />}
                      variant="contained"
                      fullWidth
                      size="large"
                      disabled={isDriver && calcTotalPallets(order) > 0 && !unloadedOrders.has(order.id)}
                      onClick={() => {
                        setDeliveryResult('');
                        setDeliveryNotes('');
                        setHasSignature(false);
                        setPhotoFiles([]);
                        setPhotoPreviews([]);
                        setDeliveryDialog({ orderId: order.id, orderNumber: order.orderNumber, orderLines: order.orderLines });
                      }}
                    >
                      דווח אספקה
                    </Button>
                  )}
                  {isCompleted && deliveryInfo && (deliveryInfo.signatureUrl || deliveryInfo.photos?.length > 0) && (
                    <Button
                      startIcon={<PhotoIcon />}
                      variant="outlined"
                      fullWidth
                      onClick={() => setViewMediaDialog({
                        signatureUrl: deliveryInfo.signatureUrl,
                        photos: deliveryInfo.photos || [],
                        orderNumber: order.orderNumber,
                      })}
                    >
                      צפה בחתימה ותמונות
                    </Button>
                  )}
                </CardActions>
              </Collapse>
            </Card>
          );
        })}
      </Box>

      {/* Delivery report dialog */}
      <Dialog open={!!deliveryDialog} onClose={() => !submitting && setDeliveryDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>דיווח אספקה - {deliveryDialog?.orderNumber}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {deliveryDialog?.orderLines && deliveryDialog.orderLines.length > 0 && (
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>פריט</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>תיאור</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', width: 50 }}>כמות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deliveryDialog.orderLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell sx={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{line.product}</TableCell>
                      <TableCell sx={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{line.description || '-'}</TableCell>
                      <TableCell align="center">{line.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <SignatureIcon fontSize="small" /> חתימת לקוח
                </Typography>
                <Button size="small" onClick={() => { signatureRef.current?.clear(); setHasSignature(false); }}>נקה</Button>
              </Box>
              <Box sx={{ border: '1px solid #ccc', borderRadius: 1, bgcolor: '#fff' }}>
                <SignatureCanvas
                  ref={signatureRef}
                  penColor="black"
                  onEnd={() => setHasSignature(true)}
                  canvasProps={{ style: { width: '100%', height: 150 } }}
                />
              </Box>
            </Box>

            <Box>
              <ToggleButtonGroup
                value={deliveryResult}
                exclusive
                onChange={(_, val) => val && setDeliveryResult(val)}
                fullWidth
                disabled={!hasSignature || photoFiles.length === 0}
                sx={{ '& .MuiToggleButton-root': { py: 1.5 } }}
              >
                {DELIVERY_RESULTS.map((opt) => (
                  <ToggleButton key={opt.value} value={opt.value} color={opt.color}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                      {opt.icon}
                      <Typography variant="caption">{opt.label}</Typography>
                    </Box>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {(!hasSignature || photoFiles.length === 0) && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}>
                  {!hasSignature && photoFiles.length === 0
                    ? 'יש לחתום ולצלם תמונה לפחות כדי לבחור סטטוס'
                    : !hasSignature
                    ? 'יש לחתום כדי לבחור סטטוס'
                    : 'יש לצלם תמונה אחת לפחות כדי לבחור סטטוס'}
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <CameraIcon fontSize="small" /> תמונות ({photoFiles.length}/5)
              </Typography>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                hidden
                onChange={handleAddPhotos}
              />
              {photoPreviews.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  {photoPreviews.map((src, i) => (
                    <Box key={i} sx={{ position: 'relative', width: 80, height: 80 }}>
                      <img src={src} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }} />
                      <IconButton
                        size="small"
                        onClick={() => handleRemovePhoto(i)}
                        sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'error.main', color: '#fff', '&:hover': { bgcolor: 'error.dark' }, width: 22, height: 22 }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
              {photoFiles.length < 5 && (
                <Button
                  variant="outlined"
                  startIcon={<CameraIcon />}
                  onClick={() => photoInputRef.current?.click()}
                  fullWidth
                >
                  צלם / בחר תמונה
                </Button>
              )}
            </Box>

            <TextField
              label="הערות (אופציונלי)"
              multiline
              rows={2}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeliveryDialog(null)} disabled={submitting}>ביטול</Button>
          <Button
            variant="contained"
            onClick={handleDeliverySubmit}
            disabled={submitting || !deliveryResult}
          >
            {submitting ? 'שומר...' : 'שמור דיווח'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View signature/photos dialog */}
      <DeliveryMediaDialog
        open={!!viewMediaDialog}
        onClose={() => setViewMediaDialog(null)}
        orderNumber={viewMediaDialog?.orderNumber || ''}
        signatureUrl={viewMediaDialog?.signatureUrl || null}
        photos={viewMediaDialog?.photos || []}
      />

      <MessagesDrawer open={messagesOpen} onClose={() => setMessagesOpen(false)} />

      {/* New message popup */}
      <Dialog open={!!messagePopup} onClose={() => setMessagePopup(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MessageIcon color="primary" />
          הודעה חדשה מ-{messagePopup?.sender}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{messagePopup?.text}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessagePopup(null)}>סגור</Button>
          <Button
            variant="contained"
            onClick={() => {
              setMessagePopup(null);
              setMessagesOpen(true);
            }}
          >
            כל ההודעות
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sign delivery note dialog */}
      <Dialog open={!!signNoteDialog} onClose={() => !signingNote && setSignNoteDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PdfIcon color="error" />
          תעודת משלוח - {signNoteDialog?.orderNumber}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<PdfIcon />}
                fullWidth
                onClick={() => window.open(signNoteDialog?.deliveryNoteUrl, '_blank')}
              >
                צפה בתעודה
              </Button>
              {signNoteDialog?.signedDeliveryNoteUrl && (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<PdfIcon />}
                  fullWidth
                  onClick={() => window.open(signNoteDialog?.signedDeliveryNoteUrl!, '_blank')}
                >
                  צפה בתעודה חתומה
                </Button>
              )}
            </Box>

            <Divider />

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <SignatureIcon fontSize="small" /> חתימת לקוח על תעודת משלוח
                </Typography>
                <Button size="small" onClick={() => { signNoteRef.current?.clear(); setSignNoteHasSig(false); }}>נקה</Button>
              </Box>
              <Box sx={{ border: '1px solid #ccc', borderRadius: 1, bgcolor: '#fff' }}>
                <SignatureCanvas
                  ref={signNoteRef}
                  penColor="black"
                  onEnd={() => setSignNoteHasSig(true)}
                  canvasProps={{ style: { width: '100%', height: 200 } }}
                />
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSignNoteDialog(null)} disabled={signingNote}>סגור</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleSignDeliveryNote}
            disabled={signingNote || !signNoteHasSig}
            startIcon={<SignatureIcon />}
          >
            {signingNote ? 'שומר חתימה...' : 'שמור חתימה על PDF'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>

      {/* Scanner overlay */}
      {scannerOpen && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, bgcolor: 'black', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, bgcolor: 'rgba(0,0,0,0.7)' }}>
            <IconButton onClick={() => { stopScanner(); setScanMode(null); }} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
            <Typography color="white" fontWeight="bold">
              {scanMode === 'LOAD' ? 'בקרת העמסה' : 'בקרת פריקה'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {hasTorch && (
                <IconButton onClick={toggleTorch} sx={{ color: torchOn ? '#ffc107' : 'white' }}>
                  {torchOn ? <FlashOnIcon /> : <FlashOffIcon />}
                </IconButton>
              )}
            </Box>
          </Box>

          {/* Scanner area */}
          <Box id="driver-scanner" sx={{ width: '100%', flexGrow: 1 }} />

          {/* Status bar */}
          <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, bgcolor: 'rgba(0,0,0,0.85)', p: 2 }}>
            {scanMessage && (
              <Alert severity={scanMessage.severity} sx={{ mb: 1, whiteSpace: 'pre-line' }}>
                {scanMessage.text}
              </Alert>
            )}
            {scanMode === 'LOAD' && loadingStatus && (
              <Box sx={{ mb: 1 }}>
                <Typography color="white" variant="body2" sx={{ mb: 0.5 }}>
                  נסרקו {loadingStatus.scannedPallets}/{loadingStatus.totalPallets} משטחים
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={loadingStatus.totalPallets > 0 ? (loadingStatus.scannedPallets / loadingStatus.totalPallets) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}
            {scanMode === 'LOAD' && (
              <Button
                variant="contained"
                fullWidth
                color="success"
                size="large"
                onClick={handleFinishLoading}
              >
                סיום העמסה
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
