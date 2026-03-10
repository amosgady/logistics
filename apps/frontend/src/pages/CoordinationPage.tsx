import { useState, useRef } from 'react';
import { useDateStore } from '../store/dateStore';
import DateNavigator from '../components/common/DateNavigator';
import {
  Box, Typography, TextField, Button, Card, CardContent,
  Chip, Alert, Snackbar, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, LinearProgress,
} from '@mui/material';
import {
  Send as SendIcon,
  Download as DownloadIcon,
  Phone as PhoneIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  LocalShipping as TruckIcon,
  Schedule as TimeIcon,
  Edit as EditIcon,
  Undo as UndoIcon,
  Photo as PhotoIcon,
  Sms as SmsIcon,
  DateRange as DateRangeIcon,
  Comment as CommentIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planningApi } from '../services/planningApi';
import { orderApi } from '../services/orderApi';
import { coordinationApi } from '../services/coordinationApi';
import { smsApi } from '../services/smsApi';
import DeliveryMediaDialog from '../components/common/DeliveryMediaDialog';
import SortableTableCell from '../components/common/SortableTableCell';
import { useSortable } from '../hooks/useSortable';

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
  deliveryDate: string;
  status: string;
  timeWindow: string | null;
  routeSequence: number | null;
  estimatedArrival: string | null;
  coordinationStatus: string;
  coordinationNotes: string | null;
  customerResponse: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  customerNotes: string | null;
  respondedAt: string | null;
  sentToDriver: boolean;
  exportedToCsv: boolean;
  deliveryNoteUrl: string | null;
  signedDeliveryNoteUrl: string | null;
  orderLines: { id: number; product: string; quantity: number; weight: string }[];
  delivery: Delivery | null;
}

interface Route {
  id: number;
  truck: { id: number; name: string } | null;
  installerProfile?: { id: number; department: string | null; user: { fullName: string } } | null;
  orders: Order[];
  totalDistanceKm: string | null;
  totalTimeMinutes: number | null;
  overtimeApproved: boolean;
  isOptimized: boolean;
  isFinalized: boolean;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} שע' ${m} דק'` : `${m} דק'`;
}

function getNearDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CoordinationStatusChip({ status }: { status: string }) {
  if (status === 'COORDINATED') {
    return <Chip icon={<CheckIcon />} label="תואם" size="small" color="success" />;
  }
  return <Chip icon={<PhoneIcon />} label="לא תואם" size="small" color="default" />;
}

function RouteOrdersTable({ orders, onToggleCoordination, onEditNotes, onUnsendOrder, onSendSms, onViewMedia, onUploadPdf, onDeletePdf, sendSmsPending, unsendPending }: {
  orders: Order[];
  onToggleCoordination: (order: Order) => void;
  onEditNotes: (order: Order) => void;
  onUnsendOrder: (orderId: number) => void;
  onSendSms: (orderId: number, phone?: string) => void;
  onViewMedia: (order: Order) => void;
  onUploadPdf: (orderId: number, file: File) => void;
  onDeletePdf: (orderId: number) => void;
  sendSmsPending: boolean;
  unsendPending: boolean;
}) {
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfUploadOrderId, setPdfUploadOrderId] = useState<number | null>(null);
  const { sortedItems, sortConfig, handleSort } = useSortable(orders);
  const [smsMenuAnchor, setSmsMenuAnchor] = useState<null | HTMLElement>(null);
  const [smsMenuOrder, setSmsMenuOrder] = useState<Order | null>(null);

  const handleSmsClick = (event: React.MouseEvent<HTMLElement>, order: Order) => {
    if (order.phone2) {
      // Has 2 phones – show selection menu
      setSmsMenuAnchor(event.currentTarget);
      setSmsMenuOrder(order);
    } else {
      // Only 1 phone – send directly
      onSendSms(order.id);
    }
  };

  const handleSmsMenuSelect = (phone: string) => {
    if (smsMenuOrder) {
      onSendSms(smsMenuOrder.id, phone);
    }
    setSmsMenuAnchor(null);
    setSmsMenuOrder(null);
  };

  return (
    <>
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <SortableTableCell label="הזמנה" sortKey="orderNumber" sortConfig={sortConfig} onSort={handleSort} />
            <SortableTableCell label="לקוח" sortKey="customerName" sortConfig={sortConfig} onSort={handleSort} />
            <SortableTableCell label="עיר" sortKey="city" sortConfig={sortConfig} onSort={handleSort} />
            <TableCell>טלפון</TableCell>
            <TableCell>SMS</TableCell>
            <SortableTableCell label="תגובת לקוח" sortKey="customerResponse" sortConfig={sortConfig} onSort={handleSort} />
            <SortableTableCell label="חלון זמן" sortKey="timeWindow" sortConfig={sortConfig} onSort={handleSort} />
            <SortableTableCell label="תיאום" sortKey="coordinationStatus" sortConfig={sortConfig} onSort={handleSort} />
            <TableCell>הערות</TableCell>
            <SortableTableCell label="נשלח" sortKey="sentToDriver" sortConfig={sortConfig} onSort={handleSort} />
            <TableCell>CSV</TableCell>
            <TableCell>ת. משלוח</TableCell>
            <TableCell>מדיה</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedItems.map((order, idx) => (
            <TableRow key={order.id} hover>
              <TableCell>{idx + 1}</TableCell>
              <TableCell>{order.orderNumber}</TableCell>
              <TableCell>{order.customerName}</TableCell>
              <TableCell>{order.city}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {order.phone}
                  {order.phone && (
                    <Tooltip title="חייג">
                      <IconButton size="small" href={`tel:${order.phone}`} component="a">
                        <PhoneIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {order.phone2 && (
                    <>
                      <Typography variant="caption" color="text.secondary" sx={{ mx: 0.5 }}>|</Typography>
                      {order.phone2}
                      <Tooltip title="חייג טלפון 2">
                        <IconButton size="small" href={`tel:${order.phone2}`} component="a">
                          <PhoneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
              </TableCell>
              <TableCell>
                {order.phone ? (
                  <Tooltip title={order.phone2 ? 'בחר מספר לשליחת SMS' : 'שלח SMS תזכורת'}>
                    <IconButton size="small" color="info" onClick={(e) => handleSmsClick(e, order)} disabled={sendSmsPending}>
                      <SmsIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : '-'}
              </TableCell>
              <TableCell>
                <CustomerResponseChip response={order.customerResponse} notes={order.customerNotes} />
              </TableCell>
              <TableCell>
                {order.timeWindow ? (
                  <Chip
                    label={order.timeWindow === 'MORNING' ? '8-12' : '12-16'}
                    size="small"
                    color={order.timeWindow === 'MORNING' ? 'info' : 'warning'}
                  />
                ) : '-'}
              </TableCell>
              <TableCell>
                <Tooltip title={order.coordinationStatus === 'COORDINATED' ? 'סמן כלא תואם' : 'סמן כתואם'}>
                  <span>
                    <IconButton size="small" onClick={() => onToggleCoordination(order)} disabled={order.sentToDriver}>
                      <CoordinationStatusChip status={order.coordinationStatus} />
                    </IconButton>
                  </span>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.coordinationNotes || '-'}
                  </Typography>
                  <Tooltip title="ערוך הערות">
                    <span>
                      <IconButton size="small" onClick={() => onEditNotes(order)} disabled={order.sentToDriver}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </TableCell>
              <TableCell>
                {order.sentToDriver && order.status === 'SENT_TO_DRIVER' ? (
                  <Tooltip title="ביטול שליחה">
                    <IconButton size="small" color="warning" onClick={() => onUnsendOrder(order.id)} disabled={unsendPending}>
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : order.sentToDriver ? (
                  <CheckIcon color="success" fontSize="small" />
                ) : (
                  <CloseIcon color="disabled" fontSize="small" />
                )}
              </TableCell>
              <TableCell>
                {order.exportedToCsv ? (
                  <CheckIcon color="success" fontSize="small" />
                ) : (
                  <CloseIcon color="disabled" fontSize="small" />
                )}
              </TableCell>
              <TableCell>
                {order.deliveryNoteUrl ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {order.signedDeliveryNoteUrl ? (
                      <Tooltip title="צפה בתעודה חתומה">
                        <IconButton size="small" color="success" onClick={() => window.open(order.signedDeliveryNoteUrl!, '_blank')}>
                          <PdfIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="צפה בתעודת משלוח">
                        <IconButton size="small" color="error" onClick={() => window.open(order.deliveryNoteUrl!, '_blank')}>
                          <PdfIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="החלף תעודת משלוח">
                      <IconButton size="small" onClick={() => { setPdfUploadOrderId(order.id); pdfInputRef.current?.click(); }}>
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Tooltip title="העלה תעודת משלוח PDF">
                    <IconButton size="small" color="default" onClick={() => { setPdfUploadOrderId(order.id); pdfInputRef.current?.click(); }}>
                      <PdfIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
              <TableCell>
                {order.delivery && (order.delivery.signatureUrl || order.delivery.photos?.length > 0) ? (
                  <Tooltip title="צפה בחתימה ותמונות">
                    <IconButton size="small" color="primary" onClick={() => onViewMedia(order)}>
                      <PhotoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>

    {/* Phone selection menu for SMS */}
    <Menu
      anchorEl={smsMenuAnchor}
      open={Boolean(smsMenuAnchor)}
      onClose={() => { setSmsMenuAnchor(null); setSmsMenuOrder(null); }}
    >
      {smsMenuOrder?.phone && (
        <MenuItem onClick={() => handleSmsMenuSelect(smsMenuOrder.phone)}>
          <ListItemIcon><PhoneIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={smsMenuOrder.phone} secondary="טלפון ראשי" />
        </MenuItem>
      )}
      {smsMenuOrder?.phone2 && (
        <MenuItem onClick={() => handleSmsMenuSelect(smsMenuOrder.phone2!)}>
          <ListItemIcon><PhoneIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={smsMenuOrder.phone2} secondary="טלפון 2" />
        </MenuItem>
      )}
    </Menu>

    {/* Hidden file input for PDF upload */}
    <input
      ref={pdfInputRef}
      type="file"
      accept="application/pdf"
      style={{ display: 'none' }}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file && pdfUploadOrderId) {
          onUploadPdf(pdfUploadOrderId, file);
          setPdfUploadOrderId(null);
        }
        e.target.value = '';
      }}
    />
    </>
  );
}

function CustomerResponseChip({ response, notes }: { response: string; notes: string | null }) {
  const hasNotes = Boolean(notes && notes.trim());

  const chip = (() => {
    if (response === 'CONFIRMED') {
      return <Chip icon={<CheckIcon />} label="אישר" size="small" color="success" />;
    }
    if (response === 'DECLINED') {
      return <Chip icon={<CloseIcon />} label="דחה" size="small" color="error" />;
    }
    return <Chip label="ממתין" size="small" color="default" variant="outlined" />;
  })();

  if (!hasNotes) {
    return chip;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
      {chip}
      <Tooltip title={notes!}>
        <Chip
          icon={<CommentIcon sx={{ fontSize: 12 }} />}
          label="הערה"
          size="small"
          color="warning"
          variant="outlined"
          sx={{ cursor: 'pointer', height: 18, '& .MuiChip-label': { fontSize: '0.65rem', px: 0.3 }, '& .MuiChip-icon': { ml: 0.3 } }}
        />
      </Tooltip>
    </Box>
  );
}

export default function CoordinationPage() {
  const queryClient = useQueryClient();
  const { selectedDate: planDate, setSelectedDate: setPlanDate } = useDateStore();
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'warning' } | null>(null);
  const [notesDialog, setNotesDialog] = useState<{ orderId: number; notes: string } | null>(null);
  const [mediaDialog, setMediaDialog] = useState<{ order: Order } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['planning-board', planDate],
    queryFn: () => planningApi.getBoard(planDate),
  });

  const board = data?.data;
  const routes: Route[] = board?.routes || [];

  // Filter routes that have orders in coordination flow
  const routesWithOrders = routes.filter((r) =>
    r.orders.some((o) => o.status === 'IN_COORDINATION' || o.status === 'APPROVED' || o.status === 'SENT_TO_DRIVER')
  );

  const coordinationMutation = useMutation({
    mutationFn: ({ orderId, coordinationStatus, coordinationNotes }: {
      orderId: number;
      coordinationStatus: string;
      coordinationNotes?: string;
    }) => orderApi.updateCoordination(orderId, { coordinationStatus, coordinationNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
    },
    onError: () => setSnackbar({ message: 'שגיאה בעדכון תיאום', severity: 'error' }),
  });

  const sendToDriverMutation = useMutation({
    mutationFn: coordinationApi.sendToDriver,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({
        message: `נשלחו ${result.data.sentCount} הזמנות לנהג ${result.data.truckName}`,
        severity: 'success',
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'שגיאה בשליחה לנהג';
      setSnackbar({ message, severity: 'error' });
    },
  });

  const exportWmsMutation = useMutation({
    mutationFn: (routeId: number) => coordinationApi.exportWmsCsv(routeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({ message: 'קובץ WMS יוצא בהצלחה', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה ביצוא WMS', severity: 'error' }),
  });

  const unsendFromDriverMutation = useMutation({
    mutationFn: coordinationApi.unsendFromDriver,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({
        message: `בוטלה שליחה של ${result.data.revertedCount} הזמנות - ${result.data.truckName}`,
        severity: 'success',
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'שגיאה בביטול שליחה';
      setSnackbar({ message, severity: 'error' });
    },
  });

  const unsendOrderMutation = useMutation({
    mutationFn: coordinationApi.unsendOrder,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({
        message: `בוטלה שליחה להזמנה ${result.data.orderNumber}`,
        severity: 'success',
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'שגיאה בביטול שליחה';
      setSnackbar({ message, severity: 'error' });
    },
  });

  // SMS mutations
  const sendOrderSmsMutation = useMutation({
    mutationFn: ({ orderId, phone }: { orderId: number; phone?: string }) =>
      smsApi.sendOrderSms(orderId, phone),
    onSuccess: (result) => {
      if (result.data?.success) {
        setSnackbar({ message: `SMS נשלח ל-${result.data.phone}`, severity: 'success' });
      } else {
        setSnackbar({ message: `שליחת SMS נכשלה: ${result.data?.error || 'שגיאה'}`, severity: 'error' });
      }
    },
    onError: (error: any) => {
      setSnackbar({ message: error.response?.data?.error?.message || 'שגיאה בשליחת SMS', severity: 'error' });
    },
  });

  const uploadPdfMutation = useMutation({
    mutationFn: ({ orderId, file }: { orderId: number; file: File }) =>
      orderApi.uploadDeliveryNote(orderId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({ message: 'תעודת משלוח הועלתה בהצלחה', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בהעלאת תעודת משלוח', severity: 'error' }),
  });

  const deletePdfMutation = useMutation({
    mutationFn: (orderId: number) => orderApi.deleteDeliveryNote(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({ message: 'תעודת משלוח נמחקה', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה במחיקת תעודת משלוח', severity: 'error' }),
  });

  const sendRouteSmsMutation = useMutation({
    mutationFn: smsApi.sendRouteSms,
    onSuccess: (result) => {
      const { sentCount, failedCount, total } = result.data;
      if (failedCount === 0) {
        setSnackbar({ message: `נשלחו ${sentCount} הודעות SMS בהצלחה`, severity: 'success' });
      } else {
        setSnackbar({
          message: `נשלחו ${sentCount}/${total} הודעות, ${failedCount} נכשלו`,
          severity: 'warning',
        });
      }
    },
    onError: (error: any) => {
      setSnackbar({ message: error.response?.data?.error?.message || 'שגיאה בשליחת SMS', severity: 'error' });
    },
  });

  const toggleCoordination = (order: Order) => {
    const newStatus = order.coordinationStatus === 'COORDINATED' ? 'NOT_STARTED' : 'COORDINATED';
    coordinationMutation.mutate({ orderId: order.id, coordinationStatus: newStatus });
  };

  const saveNotes = () => {
    if (!notesDialog) return;
    coordinationMutation.mutate({
      orderId: notesDialog.orderId,
      coordinationStatus: 'COORDINATED',
      coordinationNotes: notesDialog.notes,
    });
    setNotesDialog(null);
  };

  const isRouteReadyToSend = (route: Route) => {
    if (route.isFinalized) return false;
    return route.orders.every(
      (o) => o.coordinationStatus === 'COORDINATED' && o.status === 'APPROVED'
    );
  };

  const getRouteCoordinationProgress = (route: Route) => {
    const coordinated = route.orders.filter((o) => o.coordinationStatus === 'COORDINATED').length;
    return { coordinated, total: route.orders.length };
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">תיאום אספקות</Typography>
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
            label="תאריך"
            value={planDate}
            onChange={(e) => setPlanDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
        </Box>
      </Box>

      {isLoading ? (
        <LinearProgress />
      ) : routesWithOrders.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">אין מסלולים מוכנים לתיאום לתאריך זה</Typography>
          <Typography variant="caption" color="text.secondary">
            שייכו הזמנות למשאיות/מתקינים בעמוד התכנון והפעילו אופטימיזציית מסלול
          </Typography>
        </Paper>
      ) : (
        routesWithOrders.map((route) => {
          const progress = getRouteCoordinationProgress(route);
          const readyToSend = isRouteReadyToSend(route);
          const allSent = route.orders.every((o) => o.sentToDriver);
          const anySent = route.orders.some((o) => o.status === 'SENT_TO_DRIVER');
          const allExported = route.orders.every((o) => o.exportedToCsv);

          return (
            <Card key={route.id} sx={{ mb: 3 }}>
              <CardContent>
                {/* Route header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TruckIcon color="primary" />
                    <Typography variant="h6">{route.truck?.name || route.installerProfile?.user?.fullName || `מסלול ${route.id}`}</Typography>
                    <Chip label={`${route.orders.length} הזמנות`} size="small" />
                    {route.totalTimeMinutes && (
                      <Chip
                        icon={<TimeIcon />}
                        label={formatMinutes(route.totalTimeMinutes)}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip
                      label={`תואמו: ${progress.coordinated}/${progress.total}`}
                      size="small"
                      color={progress.coordinated === progress.total ? 'success' : 'default'}
                    />
                    {allSent && <Chip label="נשלח לנהג" size="small" color="info" />}
                    {allExported && <Chip label="יוצא CSV" size="small" color="secondary" />}
                  </Box>
                </Box>

                <Divider sx={{ mb: 1 }} />

                {/* Orders table */}
                <RouteOrdersTable
                  orders={route.orders}
                  onToggleCoordination={toggleCoordination}
                  onEditNotes={(order) => setNotesDialog({ orderId: order.id, notes: order.coordinationNotes || '' })}
                  onUnsendOrder={(orderId) => unsendOrderMutation.mutate(orderId)}
                  onSendSms={(orderId, phone?) => sendOrderSmsMutation.mutate({ orderId, phone })}
                  onViewMedia={(order) => setMediaDialog({ order })}
                  onUploadPdf={(orderId, file) => uploadPdfMutation.mutate({ orderId, file })}
                  onDeletePdf={(orderId) => deletePdfMutation.mutate(orderId)}
                  sendSmsPending={sendOrderSmsMutation.isPending}
                  unsendPending={unsendOrderMutation.isPending}
                />

                {/* Action buttons */}
                <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'flex-end' }}>
                  {anySent && (
                    <Button
                      variant="outlined"
                      color="warning"
                      startIcon={unsendFromDriverMutation.isPending ? <CircularProgress size={16} /> : <UndoIcon />}
                      onClick={() => unsendFromDriverMutation.mutate(route.id)}
                      disabled={unsendFromDriverMutation.isPending}
                    >
                      ביטול שליחה לכולם
                    </Button>
                  )}
                  {!allSent && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={sendToDriverMutation.isPending ? <CircularProgress size={16} /> : <SendIcon />}
                      onClick={() => sendToDriverMutation.mutate(route.id)}
                      disabled={!readyToSend || sendToDriverMutation.isPending}
                    >
                      שלח לנהג
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    color="info"
                    startIcon={sendRouteSmsMutation.isPending ? <CircularProgress size={16} /> : <SmsIcon />}
                    onClick={() => sendRouteSmsMutation.mutate(route.id)}
                    disabled={route.orders.length === 0 || sendRouteSmsMutation.isPending}
                  >
                    שלח SMS לכל הלקוחות
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={exportWmsMutation.isPending ? <CircularProgress size={16} /> : <DownloadIcon />}
                    onClick={() => exportWmsMutation.mutate(route.id)}
                    disabled={route.orders.length === 0 || exportWmsMutation.isPending}
                  >
                    {allExported ? 'ייצוא WMS שוב' : 'ייצוא WMS'}
                  </Button>
                </Box>

                {!readyToSend && !allSent && (
                  <Alert severity="info" sx={{ mt: 1, py: 0 }}>
                    {progress.coordinated < progress.total
                      ? `יש לתאם ${progress.total - progress.coordinated} הזמנות לפני שליחה לנהג`
                      : 'כל ההזמנות צריכות להיות בסטטוס "מאושר" לפני שליחה לנהג'}
                  </Alert>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Notes dialog */}
      <Dialog open={!!notesDialog} onClose={() => setNotesDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>הערות תיאום</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            rows={3}
            fullWidth
            value={notesDialog?.notes || ''}
            onChange={(e) => setNotesDialog((prev) => prev ? { ...prev, notes: e.target.value } : null)}
            placeholder="הערות תיאום טלפוני..."
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotesDialog(null)}>ביטול</Button>
          <Button variant="contained" onClick={saveNotes}>שמור ותאם</Button>
        </DialogActions>
      </Dialog>

      {/* Media dialog */}
      {mediaDialog?.order.delivery && (
        <DeliveryMediaDialog
          open={!!mediaDialog}
          onClose={() => setMediaDialog(null)}
          orderNumber={mediaDialog.order.orderNumber}
          signatureUrl={mediaDialog.order.delivery.signatureUrl}
          photos={mediaDialog.order.delivery.photos || []}
          deliveryResult={mediaDialog.order.delivery.result}
          deliveryNotes={mediaDialog.order.delivery.notes}
          deliveredAt={mediaDialog.order.delivery.deliveredAt}
        />
      )}

      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
