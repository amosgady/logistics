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
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planningApi } from '../services/planningApi';
import { zoneApi } from '../services/zoneApi';
import { INSTALLER_DEPARTMENTS, INSTALLER_DEPARTMENT_LABELS } from '../constants/departments';
import { useDateStore } from '../store/dateStore';

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

function RouteCard({
  route,
  onRemoveOrder,
  onOptimize,
  onApproveOvertime,
  onAssignTimeWindows,
  onSendToCoordination,
  isOptimizing,
  isSendingToCoordination,
}: {
  route: Route;
  onRemoveOrder: (orderId: number) => void;
  onOptimize: () => void;
  onApproveOvertime: () => void;
  onAssignTimeWindows: () => void;
  onSendToCoordination: () => void;
  isOptimizing: boolean;
  isSendingToCoordination: boolean;
}) {
  const isInstaller = !!route.installerProfile;
  const ownerName = isInstaller ? route.installerProfile!.user.fullName : route.truck?.name || '';

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
          </Box>
          <Chip label={`${route.orders.length} הזמנות`} size="small" />
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
                    {order.city} | {calcOrderWeight(order).toFixed(0)} ק"ג
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
              route.orders.every((o) => o.status !== 'PLANNING')
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
  const [selectedTruck, setSelectedTruck] = useState<number | ''>('');
  const [selectedInstallerByDept, setSelectedInstallerByDept] = useState<Record<string, number | ''>>({});
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'warning' } | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<any>(null);
  const [optimizingRouteId, setOptimizingRouteId] = useState<number | null>(null);
  const [optimizedRouteId, setOptimizedRouteId] = useState<number | null>(null);
  const [manualStops, setManualStops] = useState<any[] | null>(null);
  const [originalStops, setOriginalStops] = useState<any[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['planning-board', planDate],
    queryFn: () => planningApi.getBoard(planDate),
  });

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
    },
    onError: () => setSnackbar({ message: 'שגיאה בשיוך הזמנה למתקין', severity: 'error' }),
  });

  const removeMutation = useMutation({
    mutationFn: planningApi.removeOrderFromTruck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
    },
  });

  const zoneMutation = useMutation({
    mutationFn: (orderIds: number[]) => zoneApi.assignZonesToOrders(orderIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
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
      setSnackbar({ message: 'שעות נוספות אושרו', severity: 'success' });
    },
  });

  const sendToCoordinationMutation = useMutation({
    mutationFn: planningApi.sendToCoordination,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
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
      setSnackbar({ message: 'חלונות זמן עודכנו', severity: 'success' });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({ routeId, orderIds }: { routeId: number; orderIds: number[] }) =>
      planningApi.reorderRoute(routeId, orderIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
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

  const handleAssign = (orderId: number) => {
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

  const handleAssignZones = () => {
    const ids = unassignedOrders.map((o) => o.id);
    if (ids.length === 0) return;
    zoneMutation.mutate(ids);
  };

  const handleOptimize = (routeId: number) => {
    setOptimizingRouteId(routeId);
    optimizeMutation.mutate(routeId);
  };

  // Group delivery orders by zone
  const ordersByZone = new Map<string, Order[]>();
  for (const order of deliveryOrders) {
    const zoneName = order.zone?.nameHe || 'לא מוגדר';
    if (!ordersByZone.has(zoneName)) ordersByZone.set(zoneName, []);
    ordersByZone.get(zoneName)!.push(order);
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
                  {/* Delivery orders section */}
                  {deliveryOrders.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TruckIcon fontSize="small" color="primary" />
                          <Typography variant="subtitle2" color="primary">
                            הזמנות הובלה ({deliveryOrders.length})
                          </Typography>
                        </Box>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                          <InputLabel>בחר משאית</InputLabel>
                          <Select
                            value={selectedTruck}
                            label="בחר משאית"
                            onChange={(e) => setSelectedTruck(e.target.value as number)}
                          >
                            {trucks.map((t: any) => (
                              <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>

                      {Array.from(ordersByZone.entries()).map(([zoneName, orders]) => (
                        <Box key={zoneName} sx={{ mb: 1.5 }}>
                          <Chip label={`${zoneName} (${orders.length})`} color="primary" size="small" sx={{ mb: 0.5 }} />
                          {orders.map((order) => (
                            <Card key={order.id} variant="outlined" sx={{ mb: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Box>
                                    <Typography variant="body2" fontWeight="bold">
                                      {order.orderNumber} - {order.customerName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {order.address}, {order.city} | {calcOrderWeight(order).toFixed(0)} ק"ג | {calcOrderPallets(order)} משטחים
                                    </Typography>
                                  </Box>
                                  <Tooltip title="שייך למשאית">
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={() => handleAssign(order.id)}
                                      disabled={!selectedTruck || assignMutation.isPending}
                                    >
                                      <AddIcon />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </CardContent>
                            </Card>
                          ))}
                        </Box>
                      ))}
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
                        return (
                        <Box key={dept} sx={{ mb: 1.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Chip
                              label={`${INSTALLER_DEPARTMENT_LABELS[dept] || dept} (${orders.length})`}
                              color="secondary"
                              size="small"
                            />
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
                          {orders.map((order) => (
                            <Card key={order.id} variant="outlined" sx={{ mb: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                              <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Box>
                                    <Typography variant="body2" fontWeight="bold">
                                      {order.orderNumber} - {order.customerName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {order.address}, {order.city}
                                    </Typography>
                                  </Box>
                                  <Tooltip title="שייך למתקין">
                                    <IconButton
                                      size="small"
                                      color="secondary"
                                      onClick={() => handleAssignInstaller(order.id, dept)}
                                      disabled={!selectedInstallerByDept[dept] || assignInstallerMutation.isPending}
                                    >
                                      <AddIcon />
                                    </IconButton>
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
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          תוצאות אופטימיזציה
          <IconButton onClick={handleCloseOptimizeDialog}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {optimizeResult && (
            <>
              {/* Fixed top section: Map + summary chips */}
              <Box sx={{ flexShrink: 0, px: 3, pt: 2, pb: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Route Map */}
                {optimizeResult.warehouse && (manualStops || optimizeResult.optimizedStops)?.some((s: any) => s.latitude != null) && (
                  <Suspense fallback={<Skeleton variant="rectangular" height="40vh" sx={{ borderRadius: 1 }} />}>
                    <RouteMap
                      stops={manualStops || optimizeResult.optimizedStops}
                      warehouse={optimizeResult.warehouse}
                      height="40vh"
                    />
                  </Suspense>
                )}

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip icon={<ClockIcon />} label={`זמן כולל: ${formatMinutes(optimizeResult.totalTimeMinutes)}`} />
                  {optimizeResult.totalDistanceKm > 0 && (
                    <Chip icon={<PlaceIcon />} label={`מרחק: ${optimizeResult.totalDistanceKm} ק"מ`} />
                  )}
                  <Chip icon={<TruckIcon />} label={`נ.יציאה: ${optimizeResult.warehouseAddress || 'מבוא הספנים 2, אשדוד'}`} variant="outlined" />
                </Box>

                {optimizeResult.exceedsWorkHours && (
                  <Alert severity="warning">
                    המסלול חורג ב-{formatMinutes(optimizeResult.overtimeMinutes)} מזמן העבודה המקסימלי ({formatMinutes(optimizeResult.maxWorkMinutes)})
                  </Alert>
                )}
              </Box>

              {/* Scrollable bottom section: Table + alerts */}
              <Box sx={{ flexGrow: 1, overflow: 'auto', px: 3, pb: 2 }}>
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
                          <th style={{ padding: '8px 4px' }}>עיר</th>
                          <th style={{ padding: '8px 4px' }}>מרחק קטע</th>
                          <th style={{ padding: '8px 4px' }}>זמן נסיעה</th>
                          <th style={{ padding: '8px 4px' }}>זמן מצטבר</th>
                          <th style={{ padding: '8px 4px' }}>הגעה משוערת</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(manualStops || optimizeResult.optimizedStops).map((stop: any, index: number) => (
                          <tr key={stop.orderId} style={{ borderBottom: '1px solid #eee' }}>
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
                            <td style={{ padding: '6px 4px' }}>{stop.city}</td>
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
                  <Alert severity="info" sx={{ mt: 1.5 }}>
                    <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                      כתובות ללא קואורדינטות ({optimizeResult.suspiciousAddresses.length}):
                    </Typography>
                    {optimizeResult.suspiciousAddresses.map((addr: any) => (
                      <Typography key={addr.orderId} variant="caption" display="block">
                        {addr.orderNumber}: {addr.address}
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
