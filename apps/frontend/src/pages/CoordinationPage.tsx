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
  Checkbox, FormControlLabel, FormGroup,
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
  Link as LinkIcon,
  DateRange as DateRangeIcon,
  Comment as CommentIcon,
  PictureAsPdf as PdfIcon,
  Print as PrintIcon,
  ArrowForward as ArrowForwardIcon,
  FactCheck as FactCheckIcon,
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
  smsReplySessions: { replyBody: string | null; repliedAt: string | null; status: string }[];
  sentToDriver: boolean;
  exportedToCsv: boolean;
  sentToChecker: boolean;
  deliveryNoteUrl: string | null;
  signedDeliveryNoteUrl: string | null;
  department: string | null;
  orderLines: { id: number; product: string; description: string | null; quantity: number; weight: string }[];
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
  color: string | null;
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

function RouteOrdersTable({ orders, onToggleCoordination, onEditNotes, onUnsendOrder, onSendSms, onViewMedia, onUploadPdf, onDeletePdf, onUnsendWms, onUnsendChecker, sendSmsPending, unsendPending }: {
  orders: Order[];
  onToggleCoordination: (order: Order) => void;
  onEditNotes: (order: Order) => void;
  onUnsendOrder: (orderId: number) => void;
  onSendSms: (orderId: number, phone?: string, method?: 'LINK' | 'REPLY') => void;
  onViewMedia: (order: Order) => void;
  onUploadPdf: (orderId: number, file: File) => void;
  onDeletePdf: (orderId: number) => void;
  onUnsendWms: (orderId: number) => void;
  onUnsendChecker: (orderId: number) => void;
  sendSmsPending: boolean;
  unsendPending: boolean;
}) {
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfUploadOrderId, setPdfUploadOrderId] = useState<number | null>(null);
  const { sortedItems, sortConfig, handleSort } = useSortable(orders);
  const [smsMenuAnchor, setSmsMenuAnchor] = useState<null | HTMLElement>(null);
  const [smsMenuOrder, setSmsMenuOrder] = useState<Order | null>(null);
  const [smsMenuMethod, setSmsMenuMethod] = useState<'LINK' | 'REPLY'>('LINK');

  const handleSmsClick = (event: React.MouseEvent<HTMLElement>, order: Order, method: 'LINK' | 'REPLY') => {
    if (order.phone2) {
      // Has 2 phones – show selection menu
      setSmsMenuAnchor(event.currentTarget);
      setSmsMenuOrder(order);
      setSmsMenuMethod(method);
    } else {
      // Only 1 phone – send directly
      onSendSms(order.id, undefined, method);
    }
  };

  const handleSmsMenuSelect = (phone: string) => {
    if (smsMenuOrder) {
      onSendSms(smsMenuOrder.id, phone, smsMenuMethod);
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
            <SortableTableCell label="נהג" sortKey="sentToDriver" sortConfig={sortConfig} onSort={handleSort} />
            <TableCell>WMS</TableCell>
            <TableCell>בודק</TableCell>
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
                  <Box sx={{ display: 'flex', gap: 0.25 }}>
                    <Tooltip title="SMS קישור">
                      <IconButton size="small" color="info" onClick={(e) => handleSmsClick(e, order, 'LINK')} disabled={sendSmsPending}>
                        <LinkIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="SMS 1/2">
                      <IconButton size="small" color="info" onClick={(e) => handleSmsClick(e, order, 'REPLY')} disabled={sendSmsPending}>
                        <SmsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : '-'}
              </TableCell>
              <TableCell>
                <CustomerResponseChip response={order.customerResponse} notes={order.customerNotes} smsReply={order.smsReplySessions?.[0]?.replyBody} />
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
                  <Tooltip title="בטל שליחה ל WMS">
                    <IconButton size="small" color="warning" onClick={() => onUnsendWms(order.id)}>
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <CloseIcon color="disabled" fontSize="small" />
                )}
              </TableCell>
              <TableCell>
                {order.sentToChecker ? (
                  <Tooltip title="בטל שליחה לבודק">
                    <IconButton size="small" color="warning" onClick={() => onUnsendChecker(order.id)}>
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
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

function CustomerResponseChip({ response, notes, smsReply }: { response: string; notes: string | null; smsReply?: string | null }) {
  const hasNotes = Boolean(notes && notes.trim());
  const hasReply = Boolean(smsReply && smsReply.trim());

  const chip = (() => {
    if (response === 'CONFIRMED') {
      return <Chip icon={<CheckIcon />} label="אישר" size="small" color="success" />;
    }
    if (response === 'DECLINED') {
      return <Chip icon={<CloseIcon />} label="דחה" size="small" color="error" />;
    }
    return <Chip label="ממתין" size="small" color="default" variant="outlined" />;
  })();

  if (!hasNotes && !hasReply) {
    return chip;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
      {chip}
      {hasReply && (
        <Tooltip title={`תשובת SMS: ${smsReply}`}>
          <Chip
            icon={<SmsIcon sx={{ fontSize: 12 }} />}
            label={smsReply!.length > 10 ? smsReply!.slice(0, 10) + '...' : smsReply!}
            size="small"
            color="info"
            variant="outlined"
            sx={{ cursor: 'pointer', height: 18, '& .MuiChip-label': { fontSize: '0.65rem', px: 0.3 }, '& .MuiChip-icon': { ml: 0.3 } }}
          />
        </Tooltip>
      )}
      {hasNotes && (
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
      )}
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

  // Show all routes that have orders (don't filter by status so orders remain visible after sending)
  const routesWithOrders = routes.filter((r) => r.orders.length > 0);

  const coordinationMutation = useMutation({
    mutationFn: ({ orderId, coordinationStatus, coordinationNotes }: {
      orderId: number;
      coordinationStatus: string;
      coordinationNotes?: string;
    }) => orderApi.updateCoordination(orderId, { coordinationStatus, coordinationNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error?.message || 'שגיאה בעדכון תיאום';
      setSnackbar({ message: msg, severity: 'error' });
    },
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
    onError: (error: any) => setSnackbar({ message: error?.message || 'שגיאה ביצוא WMS', severity: 'error' }),
  });

  const unsendWmsMutation = useMutation({
    mutationFn: coordinationApi.unsendWmsExport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({ message: 'בוטלה שליחה ל WMS', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בביטול WMS', severity: 'error' }),
  });

  const sendToCheckerMutation = useMutation({
    mutationFn: coordinationApi.sendToChecker,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({ message: `נשלחו ${result.data.sentCount} הזמנות לבודק`, severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בשליחה לבודק', severity: 'error' }),
  });

  const unsendCheckerMutation = useMutation({
    mutationFn: coordinationApi.unsendFromChecker,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({ message: 'בוטלה שליחה לבודק', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בביטול שליחה לבודק', severity: 'error' }),
  });

  const unsendWmsRouteMutation = useMutation({
    mutationFn: coordinationApi.unsendWmsRoute,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({
        message: `בוטלה שליחה ל-WMS של ${result.data.revertedCount} הזמנות - ${result.data.truckName}`,
        severity: 'success',
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'שגיאה בביטול שליחה ל-WMS';
      setSnackbar({ message, severity: 'error' });
    },
  });

  const unsendCheckerRouteMutation = useMutation({
    mutationFn: coordinationApi.unsendCheckerRoute,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
      setSnackbar({
        message: `בוטלה שליחה לבודק של ${result.data.revertedCount} הזמנות - ${result.data.truckName}`,
        severity: 'success',
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'שגיאה בביטול שליחה לבודק';
      setSnackbar({ message, severity: 'error' });
    },
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
    mutationFn: ({ orderId, phone, method }: { orderId: number; phone?: string; method?: 'LINK' | 'REPLY' }) =>
      smsApi.sendOrderSms(orderId, phone, method),
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

  const sendRouteSmsLinkMutation = useMutation({
    mutationFn: (routeId: number) => smsApi.sendRouteSms(routeId, 'LINK'),
    onSuccess: (result) => {
      const { sentCount, failedCount, total } = result.data;
      if (failedCount === 0) {
        setSnackbar({ message: `נשלחו ${sentCount} הודעות SMS (קישור) בהצלחה`, severity: 'success' });
      } else {
        setSnackbar({
          message: `נשלחו ${sentCount}/${total} הודעות (קישור), ${failedCount} נכשלו`,
          severity: 'warning',
        });
      }
    },
    onError: (error: any) => {
      setSnackbar({ message: error.response?.data?.error?.message || 'שגיאה בשליחת SMS', severity: 'error' });
    },
  });

  const sendRouteSmsReplyMutation = useMutation({
    mutationFn: (routeId: number) => smsApi.sendRouteSms(routeId, 'REPLY'),
    onSuccess: (result) => {
      const { sentCount, failedCount, total } = result.data;
      if (failedCount === 0) {
        setSnackbar({ message: `נשלחו ${sentCount} הודעות SMS (1/2) בהצלחה`, severity: 'success' });
      } else {
        setSnackbar({
          message: `נשלחו ${sentCount}/${total} הודעות (1/2), ${failedCount} נכשלו`,
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

  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printSelectedIds, setPrintSelectedIds] = useState<Set<number>>(new Set());
  const [printableOrders, setPrintableOrders] = useState<Order[]>([]);

  const handleOpenPrintDialog = () => {
    const sentOrders = routes.flatMap((r) =>
      r.orders.filter((o) => o.status === 'SENT_TO_DRIVER')
    );
    if (sentOrders.length === 0) {
      setSnackbar({ message: 'אין הזמנות בסטטוס "נשלח"', severity: 'warning' });
      return;
    }
    setPrintableOrders(sentOrders);
    setPrintSelectedIds(new Set(sentOrders.map((o) => o.id)));
    setPrintDialogOpen(true);
  };

  const handleTogglePrintOrder = (orderId: number) => {
    setPrintSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleToggleAllPrint = () => {
    if (printSelectedIds.size === printableOrders.length) {
      setPrintSelectedIds(new Set());
    } else {
      setPrintSelectedIds(new Set(printableOrders.map((o) => o.id)));
    }
  };

  const handlePrintSelected = () => {
    const ordersToPrint = printableOrders.filter((o) => printSelectedIds.has(o.id));
    if (ordersToPrint.length === 0) return;

    const formatDate = (d: string) => {
      const date = new Date(d);
      return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    };

    const deptLabels: Record<string, string> = {
      GENERAL_TRANSPORT: 'הובלה כללית',
      SHOWER_INSTALLATION: 'התקנת מקלחונים',
      PERGOLA_INSTALLATION: 'התקנת פרגולות',
    };

    const printContent = ordersToPrint.map((order) => `
      <div class="page">
        <h2>הזמנה: ${order.orderNumber}</h2>
        <table class="header-table">
          <tr><td><strong>לקוח:</strong> ${order.customerName}</td></tr>
          <tr><td><strong>כתובת:</strong> ${order.address}, ${order.city}</td></tr>
          <tr><td><strong>תאריך אספקה:</strong> ${formatDate(order.deliveryDate)}</td></tr>
          <tr><td><strong>מחלקה:</strong> ${order.department ? (deptLabels[order.department] || order.department) : '-'}</td></tr>
        </table>
        <table class="lines-table">
          <thead>
            <tr>
              <th>#</th>
              <th>פריט</th>
              <th>תיאור</th>
              <th>כמות</th>
            </tr>
          </thead>
          <tbody>
            ${order.orderLines.map((line, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${line.product}</td>
                <td>${line.description || '-'}</td>
                <td>${line.quantity}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>הדפסת הזמנות</title>
        <style>
          @media print { .page { page-break-after: always; } .page:last-child { page-break-after: avoid; } }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .page { padding: 20px; }
          h2 { margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 8px; }
          .header-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
          .header-table td { padding: 4px 0; font-size: 16px; }
          .lines-table { width: 100%; border-collapse: collapse; }
          .lines-table th, .lines-table td { border: 1px solid #ccc; padding: 8px; text-align: right; }
          .lines-table th { background: #f0f0f0; font-weight: bold; }
        </style>
      </head>
      <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    setPrintDialogOpen(false);
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
            startIcon={<PrintIcon />}
            onClick={handleOpenPrintDialog}
          >
            הדפסה לבודקים
          </Button>
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
          const anyExported = route.orders.some((o) => o.exportedToCsv);
          const anySentToChecker = route.orders.some((o) => o.sentToChecker);

          return (
            <Card key={route.id} sx={{ mb: 3 }}>
              <CardContent>
                {/* Route header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TruckIcon color="primary" />
                    <Typography variant="h6">
                      {route.truck?.name || route.installerProfile?.user?.fullName || `מסלול ${route.id}`}
                      {(route as any).roundNumber > 1 && ` (סבב ${(route as any).roundNumber})`}
                    </Typography>
                    {route.color && (
                      <Chip label={route.color} size="small" sx={{ fontWeight: 'bold' }} color="default" />
                    )}
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
                    {allExported && <Chip label="נשלח ל WMS" size="small" color="secondary" />}
                  </Box>
                </Box>

                <Divider sx={{ mb: 1 }} />

                {/* Orders table */}
                <RouteOrdersTable
                  orders={route.orders}
                  onToggleCoordination={toggleCoordination}
                  onEditNotes={(order) => setNotesDialog({ orderId: order.id, notes: order.coordinationNotes || '' })}
                  onUnsendOrder={(orderId) => unsendOrderMutation.mutate(orderId)}
                  onSendSms={(orderId, phone?, method?) => sendOrderSmsMutation.mutate({ orderId, phone, method })}
                  onViewMedia={(order) => setMediaDialog({ order })}
                  onUploadPdf={(orderId, file) => uploadPdfMutation.mutate({ orderId, file })}
                  onDeletePdf={(orderId) => deletePdfMutation.mutate(orderId)}
                  onUnsendWms={(orderId) => unsendWmsMutation.mutate(orderId)}
                  onUnsendChecker={(orderId) => unsendCheckerMutation.mutate(orderId)}
                  sendSmsPending={sendOrderSmsMutation.isPending}
                  unsendPending={unsendOrderMutation.isPending}
                />

                {/* Action buttons - RTL right to left: שלח SMS, שלח ל WMS, שלח לנהג, שלח לבודק, ביטול שליחה לנהג, ביטול שליחה ל WMS, ביטול שליחה לבודק */}
                <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    color="info"
                    size="small"
                    startIcon={sendRouteSmsLinkMutation.isPending ? <CircularProgress size={16} /> : <SmsIcon />}
                    onClick={() => sendRouteSmsLinkMutation.mutate(route.id)}
                    disabled={route.orders.length === 0 || sendRouteSmsLinkMutation.isPending || sendRouteSmsReplyMutation.isPending}
                  >
                    SMS קישור
                  </Button>
                  <Button
                    variant="outlined"
                    color="info"
                    size="small"
                    startIcon={sendRouteSmsReplyMutation.isPending ? <CircularProgress size={16} /> : <SmsIcon />}
                    onClick={() => sendRouteSmsReplyMutation.mutate(route.id)}
                    disabled={route.orders.length === 0 || sendRouteSmsReplyMutation.isPending || sendRouteSmsLinkMutation.isPending}
                  >
                    SMS 1/2
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={exportWmsMutation.isPending ? <CircularProgress size={16} /> : <ArrowForwardIcon />}
                    onClick={() => exportWmsMutation.mutate(route.id)}
                    disabled={route.orders.length === 0 || exportWmsMutation.isPending}
                  >
                    שלח ל WMS
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={sendToDriverMutation.isPending ? <CircularProgress size={16} /> : <SendIcon />}
                    onClick={() => sendToDriverMutation.mutate(route.id)}
                    disabled={route.orders.length === 0 || !allExported || sendToDriverMutation.isPending}
                  >
                    שלח לנהג
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={sendToCheckerMutation.isPending ? <CircularProgress size={16} /> : <FactCheckIcon />}
                    onClick={() => sendToCheckerMutation.mutate(route.id)}
                    disabled={!allExported || sendToCheckerMutation.isPending}
                  >
                    שלח לבודק
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={unsendFromDriverMutation.isPending ? <CircularProgress size={16} /> : <UndoIcon />}
                    onClick={() => unsendFromDriverMutation.mutate(route.id)}
                    disabled={!anySent || unsendFromDriverMutation.isPending}
                  >
                    ביטול שליחה לנהג
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={unsendWmsRouteMutation.isPending ? <CircularProgress size={16} /> : <UndoIcon />}
                    onClick={() => unsendWmsRouteMutation.mutate(route.id)}
                    disabled={!anyExported || unsendWmsRouteMutation.isPending}
                  >
                    ביטול שליחה ל WMS
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={unsendCheckerRouteMutation.isPending ? <CircularProgress size={16} /> : <UndoIcon />}
                    onClick={() => unsendCheckerRouteMutation.mutate(route.id)}
                    disabled={!anySentToChecker || unsendCheckerRouteMutation.isPending}
                  >
                    ביטול שליחה לבודק
                  </Button>
                </Box>

                {!allSent && (!readyToSend || !allExported) && (
                  <Alert severity="info" sx={{ mt: 1, py: 0 }}>
                    {progress.coordinated < progress.total
                      ? `יש לתאם ${progress.total - progress.coordinated} הזמנות לפני שליחה לנהג`
                      : !readyToSend
                      ? 'כל ההזמנות צריכות להיות בסטטוס "מתואם" לפני שליחה לנהג'
                      : 'יש לשלוח ל-WMS לפני שליחה לנהג'}
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

      <Dialog open={printDialogOpen} onClose={() => setPrintDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>בחר הזמנות להדפסה</DialogTitle>
        <DialogContent>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={printSelectedIds.size === printableOrders.length && printableOrders.length > 0}
                  indeterminate={printSelectedIds.size > 0 && printSelectedIds.size < printableOrders.length}
                  onChange={handleToggleAllPrint}
                />
              }
              label={<strong>בחר הכל ({printableOrders.length})</strong>}
            />
            <Divider sx={{ my: 1 }} />
            {printableOrders.map((order) => (
              <FormControlLabel
                key={order.id}
                control={
                  <Checkbox
                    checked={printSelectedIds.has(order.id)}
                    onChange={() => handleTogglePrintOrder(order.id)}
                  />
                }
                label={`${order.orderNumber} — ${order.customerName} (${order.city})`}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintDialogOpen(false)}>ביטול</Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={handlePrintSelected}
            disabled={printSelectedIds.size === 0}
          >
            הדפס ({printSelectedIds.size})
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
