import { useState, lazy, Suspense } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  Chip, IconButton, Alert, Snackbar, Divider, Paper,
  List, ListItem, ListItemText, ListItemSecondaryAction,
  Select, MenuItem, FormControl, InputLabel, LinearProgress,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Skeleton,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Schedule as TimeIcon,
  Warning as WarningIcon,
  LocalShipping as TruckIcon,
  Route as RouteIcon,
  CheckCircle as ApproveIcon,
  AccessTime as ClockIcon,
  Place as PlaceIcon,
  Close as CloseIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Save as SaveIcon,
  RestartAlt as ResetIcon,
  Build as InstallerIcon,
  DateRange as DateRangeIcon,
  Send as SendIcon,
  Map as MapIcon,
  ViewList as ListIcon,
  VerticalSplit as EqualIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planningApi } from '../services/planningApi';
import { settingsApi } from '../services/settingsApi';
import { zoneApi } from '../services/zoneApi';
import { INSTALLER_DEPARTMENTS, INSTALLER_DEPARTMENT_LABELS, DEPARTMENT_LABELS } from '../constants/departments';
import { useDateStore } from '../store/dateStore';
import DateNavigator from '../components/common/DateNavigator';

const RouteMap = lazy(() => import('../components/planning/RouteMap'));

interface OrderLine {
  id: number;
  product: string;
  quantity: number;
  weight: string;
}

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  phone2: string | null;
  floor: number | null;
  elevator: boolean | null;
  deliveryDate: string;
  department: string | null;
  status: string;
  coordinationStatus: string;
  timeWindow: string | null;
  routeSequence: number | null;
  estimatedArrival: string | null;
  geoSortOrder: number | null;
  latitude: number | null;
  longitude: number | null;
  palletCount: number;
  zone: { id: number; name: string; nameHe: string } | null;
  orderLines: OrderLine[];
}

interface InstallerProfile {
  id: number;
  startTime: string;
  endTime: string;
  department: string | null;
  user: { id: number; fullName: string; phone: string | null; isActive: boolean };
  zone?: { id: number; name: string; nameHe: string } | null;
}

interface Route {
  id: number;
  truck: { id: number; name: string; maxWeightKg: string; maxPallets: number; workHoursPerDay: string; waitTimePerStop: number } | null;
  installerProfile: InstallerProfile | null;
  orders: Order[];
  totalDistanceKm: string | null;
  totalTimeMinutes: number | null;
  overtimeApproved: boolean;
  isOptimized: boolean;
  color: string | null;
}

function getNearDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isInstallerDepartment(department: string | null | undefined): boolean {
  return !!department && (INSTALLER_DEPARTMENTS as readonly string[]).includes(department);
}

function calcOrderWeight(order: Order) {
  return order.orderLines.reduce((sum, l) => sum + Number(l.weight), 0);
}

function calcOrderPallets(order: Order) {
  return order.palletCount;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} שע' ${m} דק'` : `${m} דק'`;
}

function openStreetView(address: string, city: string, lat?: number | null, lng?: number | null) {
  if (lat && lng) {
    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
  } else {
    window.open(`https://www.google.com/maps/search/${encodeURIComponent(`${address}, ${city}, ישראל`)}`, '_blank');
  }
}

function RouteCard({
  route,
  onRemoveOrder,
  onOptimize,
  onApproveOvertime,
  onAssignTimeWindows,
  onSendToCoordination,
  isOptimizing,
  isSendingToCoordination,
  truckColors,
  onSetColor,
}: {
  route: Route;
  onRemoveOrder: (orderId: number) => void;
  onOptimize: () => void;
  onApproveOvertime: () => void;
  onAssignTimeWindows: () => void;
  onSendToCoordination: () => void;
  isOptimizing: boolean;
  isSendingToCoordination: boolean;
  truckColors: { department: string; color: string }[];
  onSetColor: (color: string | null) => void;
}) {
  const isInstaller = !!route.installerProfile;
  const ownerName = isInstaller ? route.installerProfile!.user.fullName : route.truck?.name || '';

  // Filter colors by route's department
  const routeDept = isInstaller ? route.installerProfile?.department : route.orders[0]?.department;
  const availableColors = truckColors
    .filter((tc) => !routeDept || tc.department === routeDept || !tc.department)
    .map((tc) => tc.color);

  // Truck capacity (only for truck routes)
  const totalWeight = route.orders.reduce((sum, o) => sum + calcOrderWeight(o), 0);
  const totalPallets = route.orders.reduce((sum, o) => sum + calcOrderPallets(o), 0);
  const maxWeight = route.truck ? Number(route.truck.maxWeightKg) : 0;
  const maxPallets = route.truck?.maxPallets || 0;
  const weightPct = maxWeight > 0 ? Math.min((totalWeight / maxWeight) * 100, 100) : 0;
  const palletPct = maxPallets > 0 ? Math.min((totalPallets / maxPallets) * 100, 100) : 0;
  const weightExceeded = !isInstaller && totalWeight > maxWeight;
  const palletsExceeded = !isInstaller && totalPallets > maxPallets;

  // Work hours
  let maxWorkMinutes = 0;
  if (route.truck) {
    maxWorkMinutes = Number(route.truck.workHoursPerDay) * 60;
  } else if (route.installerProfile) {
    const [sh, sm] = (route.installerProfile.startTime || '08:00').split(':').map(Number);
    const [eh, em] = (route.installerProfile.endTime || '17:00').split(':').map(Number);
    maxWorkMinutes = (eh * 60 + em) - (sh * 60 + sm);
  }
  const hasOvertime = route.totalTimeMinutes != null && route.totalTimeMinutes > maxWorkMinutes;

  return (
    <Card sx={{ mb: 2, border: (weightExceeded || palletsExceeded) ? '2px solid #f44336' : undefined }}>
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isInstaller ? <InstallerIcon color="secondary" /> : <TruckIcon color="primary" />}
            <Typography variant="h6">{ownerName}</Typography>
            {isInstaller && route.installerProfile?.department && (
              <Chip
                label={INSTALLER_DEPARTMENT_LABELS[route.installerProfile.department] || route.installerProfile.department}
                size="small"
                color="secondary"
                variant="outlined"
              />
            )}
            {route.color && (
              <Chip label={route.color} size="small" sx={{ fontWeight: 'bold' }} color="default" />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {availableColors.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <Select
                  value={route.color || ''}
                  displayEmpty
                  onChange={(e) => onSetColor(e.target.value || null)}
                  sx={{ height: 28, fontSize: '0.8rem' }}
                >
                  <MenuItem value=""><em>ללא צבע</em></MenuItem>
                  {availableColors.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Chip label={`${route.orders.length} הזמנות`} size="small" />
          </Box>
        </Box>

        {/* Route summary */}
        {route.totalTimeMinutes != null && (
          <Box sx={{ display: 'flex', gap: 2, mb: 1, flexWrap: 'wrap' }}>
            <Chip
              icon={<ClockIcon />}
              label={`זמן: ${formatMinutes(route.totalTimeMinutes)}`}
              size="small"
              variant="outlined"
              color={hasOvertime ? 'error' : 'default'}
            />
            {route.totalDistanceKm && Number(route.totalDistanceKm) > 0 && (
              <Chip
                icon={<PlaceIcon />}
                label={`מרחק: ${Number(route.totalDistanceKm).toFixed(1)} ק"מ`}
                size="small"
                variant="outlined"
              />
            )}
            {hasOvertime && !route.overtimeApproved && (
              <Chip
                icon={<WarningIcon />}
                label={`חריגה: ${formatMinutes(route.totalTimeMinutes - maxWorkMinutes)}`}
                size="small"
                color="error"
              />
            )}
            {route.overtimeApproved && (
              <Chip
                icon={<ApproveIcon />}
                label="שעות נוספות אושרו"
                size="small"
                color="success"
              />
            )}
          </Box>
        )}

        {/* Capacity bars - only for truck routes */}
        {!isInstaller && (
          <>
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption">
                  משקל: {totalWeight.toFixed(0)}/{maxWeight.toLocaleString()} ק"ג
                </Typography>
                {weightExceeded && <WarningIcon color="error" fontSize="small" />}
              </Box>
              <LinearProgress
                variant="determinate"
                value={weightPct}
                color={weightExceeded ? 'error' : weightPct > 80 ? 'warning' : 'primary'}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption">
                  משטחים: {totalPallets}/{maxPallets}
                </Typography>
                {palletsExceeded && <WarningIcon color="error" fontSize="small" />}
              </Box>
              <LinearProgress
                variant="determinate"
                value={palletPct}
                color={palletsExceeded ? 'error' : palletPct > 80 ? 'warning' : 'primary'}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>

            {(weightExceeded || palletsExceeded) && (
              <Alert severity="error" sx={{ mb: 1, py: 0 }}>
                {weightExceeded && 'חריגה במשקל! '}
                {palletsExceeded && 'חריגה במשטחים!'}
              </Alert>
            )}
          </>
        )}

        {/* Installer time capacity bar */}
        {isInstaller && maxWorkMinutes > 0 && route.totalTimeMinutes != null && (
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption">
                זמן: {formatMinutes(route.totalTimeMinutes)} / {formatMinutes(maxWorkMinutes)}
              </Typography>
              {hasOvertime && <WarningIcon color="error" fontSize="small" />}
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min((route.totalTimeMinutes / maxWorkMinutes) * 100, 100)}
              color={hasOvertime ? 'error' : route.totalTimeMinutes / maxWorkMinutes > 0.8 ? 'warning' : 'primary'}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        )}

        {hasOvertime && !route.overtimeApproved && (
          <Alert
            severity="warning"
            sx={{ mb: 1, py: 0 }}
            action={
              <Button size="small" color="warning" onClick={onApproveOvertime}>
                אשר שעות נוספות
              </Button>
            }
          >
            המסלול חורג מ-{formatMinutes(maxWorkMinutes)} שעות עבודה
          </Alert>
        )}

        <Divider sx={{ my: 1 }} />

        {/* Orders list */}
        <List dense disablePadding>
          {route.orders.map((order, idx) => (
            <ListItem key={order.id} sx={{ px: 0 }}>
              <Chip label={idx + 1} size="small" sx={{ mr: 1, minWidth: 28 }} />
              <ListItemText
                primary={`${order.orderNumber} - ${order.customerName}`}
                secondary={
                  <>
                    <Box
                      component="span"
                      sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline', color: 'primary.main' } }}
                      title="Street View"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        openStreetView(order.address, order.city, order.latitude, order.longitude);
                      }}
                    >
                      {order.city}
                    </Box>
                    {' '}| {calcOrderWeight(order).toFixed(0)} ק"ג
                    {order.estimatedArrival && (
                      <> | הגעה: {new Date(order.estimatedArrival).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</>
                    )}
                  </>
                }
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              <ListItemSecondaryAction>
                {order.timeWindow && (
                  <Chip
                    label={order.timeWindow === 'MORNING' ? '8-12' : '12-16'}
                    size="small"
                    color={order.timeWindow === 'MORNING' ? 'info' : 'warning'}
                    sx={{ mr: 0.5 }}
                  />
                )}
                <Tooltip title={
                  order.coordinationStatus === 'COORDINATED'
                    ? 'לא ניתן להסיר הזמנה מתואמת'
                    : isInstaller ? 'הסר ממתקין' : 'הסר ממשאית'
                }>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => onRemoveOrder(order.id)}
                      disabled={order.coordinationStatus === 'COORDINATED'}
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>

        {/* Route action buttons */}
        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="contained"
            startIcon={isOptimizing ? <CircularProgress size={16} /> : <RouteIcon />}
            onClick={onOptimize}
            disabled={route.orders.length < 2 || isOptimizing}
          >
            {isOptimizing ? 'מאמטם...' : 'אופטימיזציית מסלול'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TimeIcon />}
            onClick={onAssignTimeWindows}
          >
            חלונות זמן
          </Button>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={isSendingToCoordination ? <CircularProgress size={16} /> : <SendIcon />}
            onClick={onSendToCoordination}
            disabled={
              isSendingToCoordination ||
              route.orders.length === 0 ||
              (route.orders.length > 1 && !route.isOptimized) ||
              route.orders.every((o) => o.status !== 'PLANNING' && o.status !== 'ASSIGNED_TO_TRUCK')
            }
          >
            העבר לתיאום
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function PlanningPage() {
  const queryClient = useQueryClient();
  const { selectedDate: planDate, setSelectedDate: setPlanDate } = useDateStore();
  const [selectedTruckByDept, setSelectedTruckByDept] = useState<Record<string, number | ''>>({});
  const [selectedInstallerByDept, setSelectedInstallerByDept] = useState<Record<string, number | ''>>({});
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'warning' } | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<any>(null);
  const [layoutMode, setLayoutMode] = useState<'map' | 'equal' | 'list'>('equal'); // map=65/35, equal=50/50, list=35/65
  const [optimizingRouteId, setOptimizingRouteId] = useState<number | null>(null);
  const [optimizedRouteId, setOptimizedRouteId] = useState<number | null>(null);
  const [manualStops, setManualStops] = useState<any[] | null>(null);
  const [originalStops, setOriginalStops] = useState<any[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['planning-board', planDate],
    queryFn: () => planningApi.getBoard(planDate),
  });

  const { data: truckColorsData } = useQuery({
    queryKey: ['truck-colors'],
    queryFn: () => settingsApi.getTruckColors(),
  });
  const truckColors: { department: string; color: string }[] = truckColorsData?.data || [];

  const board = data?.data;
  const unassignedOrders: Order[] = board?.unassignedOrders || [];
  const routes: Route[] = board?.routes || [];
  const trucks = board?.trucks || [];
  const installers: InstallerProfile[] = board?.installers || [];

  // Split unassigned orders
  const deliveryOrders = unassignedOrders.filter((o) => !isInstallerDepartment(o.department));
  const installationOrders = unassignedOrders.filter((o) => isInstallerDepartment(o.department));

  // Split routes
  const truckRoutes = routes.filter((r) => !!r.truck);
  const installerRoutes = routes.filter((r) => !!r.installerProfile);

  const assignMutation = useMutation({
    mutationFn: ({ orderId, truckId }: { orderId: number; truckId: number }) =>
      planningApi.assignOrderToTruck(orderId, truckId, planDate),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      if (result.data.warnings?.length > 0) {
        setSnackbar({ message: result.data.warnings.join(' | '), severity: 'warning' });
      }
    },
    onError: () => setSnackbar({ message: 'שגיאה בשיוך הזמנה', severity: 'error' }),
  });

  const assignInstallerMutation = useMutation({
    mutationFn: ({ orderId, installerProfileId }: { orderId: number; installerProfileId: number }) =>
      planningApi.assignOrderToInstaller(orderId, installerProfileId, planDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => setSnackbar({ message: 'שגיאה בשיוך הזמנה למתקין', severity: 'error' }),
  });

  const removeMutation = useMutation({
    mutationFn: planningApi.removeOrderFromTruck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const zoneMutation = useMutation({
    mutationFn: (orderIds: number[]) => zoneApi.assignZonesToOrders(orderIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({
        message: `שויכו ${result.data.assigned} הזמנות לאזורים. ${result.data.unmatched} ללא התאמה.`,
        severity: result.data.unmatched > 0 ? 'warning' : 'success',
      });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: planningApi.optimizeRoute,
    onSuccess: (result, routeId) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setOptimizedRouteId(routeId);
      setOptimizingRouteId(null);
      const data = result.data;
      setOptimizeResult(data);
      const stops = data.optimizedStops || [];
      setManualStops([...stops]);
      setOriginalStops([...stops]);

      if (data.suspiciousAddresses?.length > 0) {
        setSnackbar({
          message: `מסלול אופטימלי! ${data.suspiciousAddresses.length} כתובות ללא קואורדינטות`,
          severity: 'warning',
        });
      } else if (data.exceedsWorkHours) {
        setSnackbar({
          message: `מסלול אופטימלי - חריגה של ${formatMinutes(data.overtimeMinutes)}`,
          severity: 'warning',
        });
      } else {
        setSnackbar({
          message: `מסלול אופטימלי! ${formatMinutes(data.totalTimeMinutes)} | ${data.totalDistanceKm} ק"מ`,
          severity: 'success',
        });
      }
    },
    onError: () => {
      setOptimizingRouteId(null);
      setSnackbar({ message: 'שגיאה באופטימיזציית מסלול', severity: 'error' });
    },
  });

  const overtimeMutation = useMutation({
    mutationFn: planningApi.approveOvertime,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({ message: 'שעות נוספות אושרו', severity: 'success' });
    },
  });

  const sendToCoordinationMutation = useMutation({
    mutationFn: planningApi.sendToCoordination,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({
        message: `${result.data.movedCount} הזמנות הועברו לתיאום`,
        severity: 'success',
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'שגיאה בהעברה לתיאום';
      setSnackbar({ message, severity: 'error' });
    },
  });

  const timeWindowMutation = useMutation({
    mutationFn: planningApi.assignTimeWindows,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({ message: 'חלונות זמן עודכנו', severity: 'success' });
    },
  });

  const geoSortMutation = useMutation({
    mutationFn: (orderIds: number[]) => planningApi.geoSort(orderIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      const noCoords = result.data?.noCoordinates?.length || 0;
      const msg = noCoords > 0
        ? `סידור גיאוגרפי בוצע. ${noCoords} הזמנות ללא קואורדינטות`
        : 'סידור גיאוגרפי בוצע בהצלחה';
      setSnackbar({ message: msg, severity: noCoords > 0 ? 'warning' : 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בסידור גיאוגרפי', severity: 'error' }),
  });

  const setRouteColorMutation = useMutation({
    mutationFn: ({ routeId, color }: { routeId: number; color: string | null }) =>
      planningApi.setRouteColor(routeId, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({ routeId, orderIds }: { routeId: number; orderIds: number[] }) =>
      planningApi.reorderRoute(routeId, orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setOriginalStops(manualStops ? [...manualStops] : null);
      setSnackbar({ message: 'סדר המסלול נשמר בהצלחה', severity: 'success' });
    },
    onError: () => {
      setSnackbar({ message: 'שגיאה בשמירת סדר המסלול', severity: 'error' });
    },
  });

  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    if (!manualStops) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= manualStops.length) return;
    const newStops = manualStops.map((s) => ({ ...s }));
    [newStops[index], newStops[newIndex]] = [newStops[newIndex], newStops[index]];
    newStops.forEach((stop, i) => {
      stop.sequence = i + 1;
    });
    setManualStops(newStops);
  };

  const handleResetOrder = () => {
    if (originalStops) {
      setManualStops([...originalStops]);
    }
  };

  const handleSaveOrder = () => {
    if (!optimizedRouteId || !manualStops) return;
    const orderIds = manualStops.map((s) => s.orderId);
    reorderMutation.mutate({ routeId: optimizedRouteId, orderIds });
  };

  const isOrderChanged = (() => {
    if (!manualStops || !originalStops) return false;
    return manualStops.some((s, i) => s.orderId !== originalStops[i]?.orderId);
  })();

  const handleCloseOptimizeDialog = () => {
    setOptimizeResult(null);
    setManualStops(null);
    setOriginalStops(null);
    setOptimizedRouteId(null);
  };

  const handleAssign = (orderId: number, dept: string) => {
    const selectedTruck = selectedTruckByDept[dept];
    if (!selectedTruck) {
      setSnackbar({ message: 'בחר משאית תחילה', severity: 'error' });
      return;
    }
    assignMutation.mutate({ orderId, truckId: selectedTruck as number });
  };

  const handleAssignInstaller = (orderId: number, dept: string) => {
    const selectedInstaller = selectedInstallerByDept[dept];
    if (!selectedInstaller) {
      setSnackbar({ message: 'בחר מתקין תחילה', severity: 'error' });
      return;
    }
    assignInstallerMutation.mutate({ orderId, installerProfileId: selectedInstaller as number });
  };

  const handleGeoSort = (orderIds: number[]) => {
    if (orderIds.length < 2) {
      setSnackbar({ message: 'נדרשות לפחות 2 הזמנות לסידור גיאוגרפי', severity: 'warning' });
      return;
    }
    geoSortMutation.mutate(orderIds);
  };

  const handleAssignZones = () => {
    const ids = unassignedOrders.map((o) => o.id);
    if (ids.length === 0) return;
    zoneMutation.mutate(ids);
  };

  const handleOptimize = (routeId: number) => {
    setOptimizingRouteId(routeId);
    optimizeMutation.mutate(routeId);
  };

  // Group delivery orders by department, then by zone within each department
  const deliveryByDept = new Map<string, Order[]>();
  for (const order of deliveryOrders) {
    const dept = order.department || '_NONE_';
    if (!deliveryByDept.has(dept)) deliveryByDept.set(dept, []);
    deliveryByDept.get(dept)!.push(order);
  }

  // For each department group, build zone sub-groups (sorted by geoSortOrder if available)
  const deptZoneGroups = new Map<string, Map<string, Order[]>>();
  for (const [dept, orders] of deliveryByDept.entries()) {
    const zoneMap = new Map<string, Order[]>();
    for (const order of orders) {
      const zoneName = order.zone?.nameHe || 'לא מוגדר';
      if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, []);
      zoneMap.get(zoneName)!.push(order);
    }
    // Sort orders within each zone by geoSortOrder
    for (const [, zoneOrders] of zoneMap.entries()) {
      zoneOrders.sort((a, b) => {
        if (a.geoSortOrder != null && b.geoSortOrder != null) return a.geoSortOrder - b.geoSortOrder;
        if (a.geoSortOrder != null) return -1;
        if (b.geoSortOrder != null) return 1;
        return 0;
      });
    }
    deptZoneGroups.set(dept, zoneMap);
  }

  // Group installation orders by department
  const ordersByDept = new Map<string, Order[]>();
  for (const order of installationOrders) {
    const dept = order.department || 'לא מוגדר';
    if (!ordersByDept.has(dept)) ordersByDept.set(dept, []);
    ordersByDept.get(dept)!.push(order);
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">תכנון מסלולים</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DateRangeIcon />}
            onClick={() => setPlanDate(getNearDate())}
          >
            תאריך קרוב
          </Button>
          <DateNavigator date={planDate} onDateChange={setPlanDate} />
          <TextField
            type="date"
            label="תאריך תכנון"
            value={planDate}
            onChange={(e) => setPlanDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <Button variant="outlined" onClick={handleAssignZones} disabled={unassignedOrders.length === 0}>
            חלוקה לאזורים
          </Button>
        </Box>
      </Box>

      {isLoading ? (
        <LinearProgress />
      ) : (
        <Grid container spacing={2}>
          {/* Left: Unassigned orders */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper sx={{ p: 2, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                הזמנות לשיוך ({unassignedOrders.length})
              </Typography>
              <Divider sx={{ mb: 1 }} />

              {unassignedOrders.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  אין הזמנות בסטטוס "בתכנון" לתאריך זה
                </Typography>
              ) : (
                <>
                  {/* Delivery orders section - grouped by department */}
                  {deliveryOrders.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <TruckIcon fontSize="small" color="primary" />
                        <Typography variant="subtitle2" color="primary">
                          הזמנות הובלה ({deliveryOrders.length})
                        </Typography>
                      </Box>

                      {Array.from(deptZoneGroups.entries()).map(([dept, zoneMap]) => {
                        const deptLabel = dept === '_NONE_' ? 'ללא מחלקה' : (DEPARTMENT_LABELS[dept] || dept);
                        const deptOrders = deliveryByDept.get(dept) || [];
                        const deptGeoSorted = deptOrders.every((o) => o.geoSortOrder != null);
                        const deptTrucks = trucks.filter((t: any) =>
                          dept === '_NONE_' ? !t.department : (t.department === dept || !t.department)
                        );
                        return (
                          <Box key={dept} sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip label={`${deptLabel} (${deptOrders.length})`} color="primary" size="small" variant="outlined" />
                                {deptGeoSorted && <Chip label="מסודר גיאוגרפית" color="success" size="small" icon={<PlaceIcon />} />}
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Button
                                  size="small"
                                  variant={deptGeoSorted ? 'outlined' : 'contained'}
                                  color="success"
                                  startIcon={<PlaceIcon />}
                                  onClick={() => handleGeoSort(deptOrders.map((o) => o.id))}
                                  disabled={deptOrders.length < 2 || geoSortMutation.isPending}
                                >
                                  {geoSortMutation.isPending ? 'מסדר...' : 'סידור גיאוגרפי'}
                                </Button>
                                <FormControl size="small" sx={{ minWidth: 150 }}>
                                  <InputLabel>בחר משאית</InputLabel>
                                  <Select
                                    value={selectedTruckByDept[dept] || ''}
                                    label="בחר משאית"
                                    onChange={(e) => setSelectedTruckByDept((prev) => ({ ...prev, [dept]: e.target.value as number }))}
                                  >
                                    {deptTrucks.map((t: any) => (
                                      <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </Box>
                            </Box>
                            {!deptGeoSorted && (
                              <Alert severity="info" sx={{ mb: 1, py: 0 }}>
                                יש לבצע סידור גיאוגרפי לפני שיוך למשאית
                              </Alert>
                            )}

                            {Array.from(zoneMap.entries()).map(([zoneName, orders]) => {
                              const zoneGeoSorted = orders.every((o) => o.geoSortOrder != null);
                              return (
                              <Box key={zoneName} sx={{ mb: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                  <Chip label={`${zoneName} (${orders.length})`} color="primary" size="small" />
                                  {!deptGeoSorted && orders.length >= 2 && (
                                    <Button
                                      size="small"
                                      variant="text"
                                      color="success"
                                      sx={{ minWidth: 'auto', fontSize: '0.7rem' }}
                                      startIcon={<PlaceIcon sx={{ fontSize: '0.9rem !important' }} />}
                                      onClick={() => handleGeoSort(orders.map((o) => o.id))}
                                      disabled={geoSortMutation.isPending}
                                    >
                                      סדר אזור
                                    </Button>
                                  )}
                                </Box>
                                {orders.map((order) => (
                                  <Card key={order.id} variant="outlined" sx={{ mb: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                                    <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                          {order.geoSortOrder != null && (
                                            <Chip label={order.geoSortOrder} size="small" color="success" sx={{ minWidth: 28, fontWeight: 'bold' }} />
                                          )}
                                          <Box>
                                            <Typography variant="body2" fontWeight="bold">
                                              {order.orderNumber} - {order.customerName}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                              <Box
                                                component="span"
                                                sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline', color: 'primary.main' } }}
                                                title="Street View"
                                                onClick={(e: React.MouseEvent) => {
                                                  e.stopPropagation();
                                                  openStreetView(order.address, order.city, order.latitude, order.longitude);
                                                }}
                                              >
                                                {order.address}, {order.city}
                                              </Box>
                                              {' '}| {calcOrderWeight(order).toFixed(0)} ק"ג | {calcOrderPallets(order)} משטחים
                                            </Typography>
                                          </Box>
                                        </Box>
                                        <Tooltip title={!deptGeoSorted && !zoneGeoSorted ? 'יש לבצע סידור גיאוגרפי תחילה' : 'שייך למשאית'}>
                                          <span>
                                          <IconButton
                                            size="small"
                                            color="primary"
                                            onClick={() => handleAssign(order.id, dept)}
                                            disabled={!selectedTruckByDept[dept] || assignMutation.isPending || (!deptGeoSorted && !zoneGeoSorted)}
                                          >
                                            <AddIcon />
                                          </IconButton>
                                          </span>
                                        </Tooltip>
                                      </Box>
                                    </CardContent>
                                  </Card>
                                ))}
                              </Box>
                              );
                            })}
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                  {/* Installation orders section */}
                  {installationOrders.length > 0 && (
                    <Box>
                      {deliveryOrders.length > 0 && <Divider sx={{ mb: 1.5 }} />}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <InstallerIcon fontSize="small" color="secondary" />
                        <Typography variant="subtitle2" color="secondary">
                          הזמנות התקנה ({installationOrders.length})
                        </Typography>
                      </Box>

                      {Array.from(ordersByDept.entries()).map(([dept, orders]) => {
                        const deptInstallers = installers.filter((inst) => inst.department === dept);
                        const deptGeoSortedInst = orders.every((o) => o.geoSortOrder != null);
                        const sortedInstOrders = [...orders].sort((a, b) => {
                          if (a.geoSortOrder != null && b.geoSortOrder != null) return a.geoSortOrder - b.geoSortOrder;
                          if (a.geoSortOrder != null) return -1;
                          if (b.geoSortOrder != null) return 1;
                          return 0;
                        });
                        return (
                        <Box key={dept} sx={{ mb: 1.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                            <Chip
                              label={`${INSTALLER_DEPARTMENT_LABELS[dept] || dept} (${orders.length})`}
                              color="secondary"
                              size="small"
                            />
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Button
                                size="small"
                                variant={deptGeoSortedInst ? 'contained' : 'outlined'}
                                color="secondary"
                                startIcon={<PlaceIcon />}
                                onClick={() => handleGeoSort(orders.map((o) => o.id))}
                                disabled={orders.length < 2 || geoSortMutation.isPending}
                              >
                                {geoSortMutation.isPending ? 'מסדר...' : 'סידור גיאוגרפי'}
                              </Button>
                              <FormControl size="small" sx={{ minWidth: 150 }}>
                                <InputLabel>בחר מתקין</InputLabel>
                                <Select
                                  value={selectedInstallerByDept[dept] || ''}
                                  label="בחר מתקין"
                                  onChange={(e) => setSelectedInstallerByDept((prev) => ({ ...prev, [dept]: e.target.value as number }))}
                                >
                                  {deptInstallers.map((inst) => (
                                    <MenuItem key={inst.id} value={inst.id}>
                                      {inst.user.fullName}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Box>
                          </Box>
                          {!deptGeoSortedInst && orders.length >= 2 && (
                            <Alert severity="info" sx={{ mb: 0.5, py: 0 }}>
                              יש לבצע סידור גיאוגרפי לפני שיוך למתקין
                            </Alert>
                          )}
                          {sortedInstOrders.map((order) => (
                            <Card key={order.id} variant="outlined" sx={{ mb: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {order.geoSortOrder != null && (
                                      <Chip label={order.geoSortOrder} size="small" color="success" sx={{ minWidth: 28, fontWeight: 'bold' }} />
                                    )}
                                    <Box>
                                      <Typography variant="body2" fontWeight="bold">
                                        {order.orderNumber} - {order.customerName}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        <Box
                                          component="span"
                                          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline', color: 'primary.main' } }}
                                          title="Street View"
                                          onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            openStreetView(order.address, order.city, order.latitude, order.longitude);
                                          }}
                                        >
                                          {order.address}, {order.city}
                                        </Box>
                                      </Typography>
                                    </Box>
                                  </Box>
                                  <Tooltip title={!deptGeoSortedInst ? 'יש לבצע סידור גיאוגרפי תחילה' : 'שייך למתקין'}>
                                    <span>
                                    <IconButton
                                      size="small"
                                      color="secondary"
                                      onClick={() => handleAssignInstaller(order.id, dept)}
                                      disabled={!deptGeoSortedInst || !selectedInstallerByDept[dept] || assignInstallerMutation.isPending}
                                    >
                                      <AddIcon />
                                    </IconButton>
                                    </span>
                                  </Tooltip>
                                </Box>
                              </CardContent>
                            </Card>
                          ))}
                        </Box>
                        );
                      })}
                    </Box>
                  )}
                </>
              )}
            </Paper>
          </Grid>

          {/* Right: Routes */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Paper sx={{ p: 2, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
              {/* Truck routes */}
              <Typography variant="h6" sx={{ mb: 1 }}>
                <TruckIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                מסלולי משאיות ({truckRoutes.length})
              </Typography>
              <Divider sx={{ mb: 1 }} />

              {truckRoutes.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  טרם שויכו הזמנות למשאיות
                </Typography>
              ) : (
                truckRoutes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onRemoveOrder={(id) => removeMutation.mutate(id)}
                    onOptimize={() => handleOptimize(route.id)}
                    onApproveOvertime={() => overtimeMutation.mutate(route.id)}
                    onAssignTimeWindows={() => timeWindowMutation.mutate(route.id)}
                    onSendToCoordination={() => sendToCoordinationMutation.mutate(route.id)}
                    isOptimizing={optimizingRouteId === route.id}
                    isSendingToCoordination={sendToCoordinationMutation.isPending}
                    truckColors={truckColors}
                    onSetColor={(color) => setRouteColorMutation.mutate({ routeId: route.id, color })}
                  />
                ))
              )}

              {/* Installer routes */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  <InstallerIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                  מסלולי מתקינים ({installerRoutes.length})
                </Typography>
                <Divider sx={{ mb: 1 }} />

                {installerRoutes.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    טרם שויכו הזמנות למתקינים
                  </Typography>
                ) : (
                  installerRoutes.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      onRemoveOrder={(id) => removeMutation.mutate(id)}
                      onOptimize={() => handleOptimize(route.id)}
                      onApproveOvertime={() => overtimeMutation.mutate(route.id)}
                      onAssignTimeWindows={() => timeWindowMutation.mutate(route.id)}
                      onSendToCoordination={() => sendToCoordinationMutation.mutate(route.id)}
                      isOptimizing={optimizingRouteId === route.id}
                      isSendingToCoordination={sendToCoordinationMutation.isPending}
                      truckColors={truckColors}
                      onSetColor={(color) => setRouteColorMutation.mutate({ routeId: route.id, color })}
                    />
                  ))
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Optimization result dialog */}
      <Dialog open={!!optimizeResult} onClose={handleCloseOptimizeDialog} fullScreen>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            תוצאות אופטימיזציה
            <Button
              size="small"
              variant={layoutMode === 'map' ? 'contained' : 'outlined'}
              startIcon={<MapIcon />}
              onClick={() => setLayoutMode('map')}
              sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
            >
              הגדל מפה
            </Button>
            <Button
              size="small"
              variant={layoutMode === 'equal' ? 'contained' : 'outlined'}
              startIcon={<EqualIcon />}
              onClick={() => setLayoutMode('equal')}
              sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
            >
              שווה
            </Button>
            <Button
              size="small"
              variant={layoutMode === 'list' ? 'contained' : 'outlined'}
              startIcon={<ListIcon />}
              onClick={() => setLayoutMode('list')}
              sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
            >
              הגדל רשימה
            </Button>
          </Box>
          <IconButton onClick={handleCloseOptimizeDialog}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {optimizeResult && (
            <>
              {/* Map section */}
              <Box sx={{ flex: layoutMode === 'map' ? '0 0 65%' : layoutMode === 'equal' ? '0 0 50%' : '0 0 35%', px: 3, pt: 1, pb: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 0, transition: 'flex 0.3s ease' }}>
                {/* Route Map */}
                {optimizeResult.warehouse && (manualStops || optimizeResult.optimizedStops)?.some((s: any) => s.latitude != null) && (
                  <Box sx={{ flex: 1, minHeight: 0 }}>
                    <Suspense fallback={<Skeleton variant="rectangular" height="100%" sx={{ borderRadius: 1 }} />}>
                      <RouteMap
                        stops={manualStops || optimizeResult.optimizedStops}
                        warehouse={optimizeResult.warehouse}
                        height="100%"
                      />
                    </Suspense>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
                  <Chip icon={<ClockIcon />} label={`זמן כולל: ${formatMinutes(optimizeResult.totalTimeMinutes)}`} />
                  {optimizeResult.totalDistanceKm > 0 && (
                    <Chip icon={<PlaceIcon />} label={`מרחק: ${optimizeResult.totalDistanceKm} ק"מ`} />
                  )}
                  <Chip icon={<TruckIcon />} label={`נ.יציאה: ${optimizeResult.warehouseAddress || 'מבוא הספנים 2, אשדוד'}`} variant="outlined" />
                </Box>

                {optimizeResult.exceedsWorkHours && (
                  <Alert severity="warning" sx={{ flexShrink: 0 }}>
                    המסלול חורג ב-{formatMinutes(optimizeResult.overtimeMinutes)} מזמן העבודה המקסימלי ({formatMinutes(optimizeResult.maxWorkMinutes)})
                  </Alert>
                )}
              </Box>

              {/* List section */}
              <Box sx={{ flex: layoutMode === 'map' ? '0 0 35%' : layoutMode === 'equal' ? '0 0 50%' : '0 0 65%', overflow: 'auto', px: 3, pb: 2, minHeight: 0, transition: 'flex 0.3s ease' }}>
                {/* Per-stop details table */}
                {(manualStops || optimizeResult.optimizedStops)?.length > 0 && (
                  <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'right', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                          <th style={{ padding: '8px 4px', width: 70 }}>סדר</th>
                          <th style={{ padding: '8px 4px' }}>#</th>
                          <th style={{ padding: '8px 4px' }}>הזמנה</th>
                          <th style={{ padding: '8px 4px' }}>לקוח</th>
                          <th style={{ padding: '8px 4px' }}>כתובת</th>
                          <th style={{ padding: '8px 4px' }}>כתובת גוגל</th>
                          <th style={{ padding: '8px 4px' }}>מרחק קטע</th>
                          <th style={{ padding: '8px 4px' }}>זמן נסיעה</th>
                          <th style={{ padding: '8px 4px' }}>זמן מצטבר</th>
                          <th style={{ padding: '8px 4px' }}>הגעה משוערת</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(manualStops || optimizeResult.optimizedStops).map((stop: any, index: number) => (
                          <tr key={stop.orderId} style={{ borderBottom: '1px solid #eee', background: stop.geocodeValid === false ? '#fff3e0' : undefined }}>
                            <td style={{ padding: '2px 4px' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleMoveStop(index, 'up')}
                                  disabled={index === 0}
                                  sx={{ p: 0.25 }}
                                >
                                  <ArrowUpIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleMoveStop(index, 'down')}
                                  disabled={index === (manualStops || optimizeResult.optimizedStops).length - 1}
                                  sx={{ p: 0.25 }}
                                >
                                  <ArrowDownIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            </td>
                            <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>{index + 1}</td>
                            <td style={{ padding: '6px 4px' }}>{stop.orderNumber}</td>
                            <td style={{ padding: '6px 4px' }}>{stop.customerName}</td>
                            <td style={{ padding: '6px 4px' }}>
                              <Box
                                component="span"
                                sx={{
                                  cursor: 'pointer',
                                  color: 'primary.main',
                                  '&:hover': { textDecoration: 'underline' },
                                }}
                                title="לחץ לפתיחת Street View"
                                onClick={() => {
                                  openStreetView(stop.address || '', stop.city, stop.latitude, stop.longitude);
                                }}
                              >
                                {stop.address ? `${stop.address}, ${stop.city}` : stop.city}
                              </Box>
                            </td>
                            <td style={{ padding: '6px 4px', fontSize: '0.85em', color: stop.geocodedAddress && !stop.geocodedAddress.includes(stop.address) ? '#e65100' : '#666' }}>
                              {stop.geocodedAddress || '-'}
                              {stop.geocodedAddress && !stop.geocodedAddress.includes(stop.address) && <span title="הכתובת שגוגל מצא שונה מהמקורית"> ⚠</span>}
                            </td>
                            <td style={{ padding: '6px 4px' }}>{stop.legDistanceKm > 0 ? `${stop.legDistanceKm} ק"מ` : '-'}</td>
                            <td style={{ padding: '6px 4px' }}>{formatMinutes(stop.legDurationMinutes)}</td>
                            <td style={{ padding: '6px 4px' }}>{formatMinutes(stop.cumulativeTravelMinutes)}</td>
                            <td style={{ padding: '6px 4px' }}>
                              {(() => {
                                const h = Math.floor(8 + stop.estimatedArrivalMinutes / 60);
                                const m = stop.estimatedArrivalMinutes % 60;
                                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                )}

                {optimizeResult.suspiciousAddresses?.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                      ⚠️ כתובות בעייתיות ({optimizeResult.suspiciousAddresses.length}):
                    </Typography>
                    {optimizeResult.suspiciousAddresses.map((addr: any) => (
                      <Typography key={addr.orderId} variant="caption" display="block">
                        {addr.orderNumber}: {addr.address} — {addr.reason || 'לא נמצאו קואורדינטות'}
                      </Typography>
                    ))}
                  </Alert>
                )}

                {optimizeResult.fallback && (
                  <Alert severity={optimizeResult.apiError ? 'warning' : 'info'} sx={{ mt: 1.5 }}>
                    {optimizeResult.apiError
                      ? `שגיאת Google Maps: ${optimizeResult.apiError}. שימוש באומדן של 15 דקות בין נקודות.`
                      : 'שימוש באומדן (ללא Google Maps) - הערכה של 15 דקות בין נקודות'}
                  </Alert>
                )}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid #ddd', gap: 1 }}>
          {isOrderChanged && (
            <Button
              variant="outlined"
              startIcon={<ResetIcon />}
              onClick={handleResetOrder}
              disabled={reorderMutation.isPending}
            >
              אפס לאופטימיזציה
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={reorderMutation.isPending ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={handleSaveOrder}
            disabled={!isOrderChanged || reorderMutation.isPending}
          >
            שמור סדר
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
