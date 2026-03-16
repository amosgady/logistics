import { useState, Fragment, useRef, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  IconButton,
  Box,
  Typography,
  TablePagination,
  Collapse,
  CircularProgress,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  Edit as EditIcon,
  Photo as PhotoIcon,
  PictureAsPdf as PdfIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import StatusChip from '../common/StatusChip';
import SortableTableCell from '../common/SortableTableCell';
import DeliveryMediaDialog from '../common/DeliveryMediaDialog';
import { useOrderStore } from '../../store/orderStore';
import { DEPARTMENT_LABELS } from '../../constants/departments';
import { orderApi } from '../../services/orderApi';
import { useSortable } from '../../hooks/useSortable';

interface OrderLine {
  id: number;
  lineNumber: number;
  product: string;
  description: string | null;
  quantity: number;
  price: string;
  discount: string | null;
  totalPrice: string | null;
  weight: string;
  currentStock: number;
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
  orderDate: string;
  deliveryDate: string;
  status: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  phone2: string | null;
  contactPerson: string | null;
  floor: number | null;
  elevator: boolean | null;
  department: string | null;
  palletCount: number;
  zone: { id: number; nameHe: string } | null;
  coordinationStatus: string;
  sentToDriver: boolean;
  exportedToCsv: boolean;
  sentToChecker: boolean;
  driverNote: string | null;
  deliveryNoteUrl: string | null;
  signedDeliveryNoteUrl: string | null;
  orderLines: OrderLine[];
  delivery: Delivery | null;
}

interface Props {
  orders: Order[];
  total: number;
  loading: boolean;
  onUpdateDeliveryDate?: (id: number, deliveryDate: string) => void;
}

function EditablePalletCount({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(order.palletCount));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (palletCount: number) => orderApi.updatePalletCount(order.id, palletCount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const save = () => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 0 && num !== order.palletCount) {
      mutation.mutate(num);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <TextField
        inputRef={inputRef}
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        size="small"
        variant="standard"
        inputProps={{ min: 0, style: { textAlign: 'center', width: 40 } }}
      />
    );
  }

  return (
    <Box
      sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, '&:hover .edit-icon': { opacity: 1 } }}
      onClick={() => { setValue(String(order.palletCount)); setEditing(true); }}
    >
      {order.palletCount}
      <EditIcon className="edit-icon" sx={{ fontSize: 12, opacity: 0, transition: 'opacity 0.2s', color: 'action.active' }} />
    </Box>
  );
}

function EditableAddress({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.address);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (address: string) => orderApi.updateAddress(order.id, address),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== order.address) {
      mutation.mutate(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <Box>
        <TextField
          inputRef={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          size="small"
          variant="standard"
          fullWidth
          inputProps={{ style: { fontSize: 14 } }}
        />
        <Typography variant="caption" color="text.secondary">{order.city}</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{ cursor: 'pointer', '&:hover .edit-icon': { opacity: 1 } }}
      onClick={() => { setValue(order.address); setEditing(true); }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <span>{order.address}, {order.city}</span>
        <EditIcon className="edit-icon" sx={{ fontSize: 12, opacity: 0, transition: 'opacity 0.2s', color: 'action.active' }} />
      </Box>
      {(order.floor != null || order.elevator != null) && (
        <Typography variant="caption" color="text.secondary" display="block">
          {order.floor != null && `קומה ${order.floor}`}
          {order.floor != null && order.elevator != null && ' · '}
          {order.elevator != null && (order.elevator ? 'מעלית' : 'ללא מעלית')}
        </Typography>
      )}
    </Box>
  );
}

function EditableDriverNote({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.driverNote || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (driverNote: string) => orderApi.updateDriverNote(order.id, driverNote),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== (order.driverNote || '')) {
      mutation.mutate(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <TextField
        inputRef={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        size="small"
        variant="standard"
        fullWidth
        multiline
        maxRows={3}
        inputProps={{ style: { fontSize: 13 } }}
        placeholder="הערה לנהג/מתקין..."
      />
    );
  }

  return (
    <Box
      sx={{ cursor: 'pointer', '&:hover .edit-icon': { opacity: 1 }, minWidth: 80 }}
      onClick={() => { setValue(order.driverNote || ''); setEditing(true); }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.driverNote || '-'}
        </Typography>
        <EditIcon className="edit-icon" sx={{ fontSize: 12, opacity: 0, transition: 'opacity 0.2s', color: 'action.active' }} />
      </Box>
    </Box>
  );
}

function EditableLineQuantity({ line, orderStatus }: { line: OrderLine; orderStatus: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(line.quantity));
  const inputRef = useRef<HTMLInputElement>(null);
  const isPending = orderStatus === 'PENDING';

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (quantity: number) => orderApi.updateLineQuantity(line.id, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const save = () => {
    const num = parseInt(value);
    if (!isNaN(num) && num > 0 && num !== line.quantity) {
      mutation.mutate(num);
    }
    setEditing(false);
  };

  if (!isPending) return <>{line.quantity}</>;

  if (editing) {
    return (
      <TextField
        inputRef={inputRef}
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        size="small"
        variant="standard"
        inputProps={{ min: 1, style: { textAlign: 'center', width: 50 } }}
      />
    );
  }

  return (
    <Box
      sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, '&:hover .edit-icon': { opacity: 1 } }}
      onClick={() => { setValue(String(line.quantity)); setEditing(true); }}
    >
      {line.quantity}
      <EditIcon className="edit-icon" sx={{ fontSize: 12, opacity: 0, transition: 'opacity 0.2s', color: 'action.active' }} />
    </Box>
  );
}

function OrderLineDetails({ orderLines, orderStatus }: { orderLines: OrderLine[]; orderStatus: string }) {
  const queryClient = useQueryClient();
  const isPending = orderStatus === 'PENDING';

  const deleteMutation = useMutation({
    mutationFn: (lineId: number) => orderApi.deleteOrderLine(lineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const handleDelete = (lineId: number, product: string) => {
    if (window.confirm(`למחוק את השורה "${product}"?`)) {
      deleteMutation.mutate(lineId);
    }
  };

  if (!orderLines || orderLines.length === 0) {
    return <Typography variant="body2" sx={{ p: 2 }}>אין שורות הזמנה</Typography>;
  }

  return (
    <Box sx={{ p: 2, bgcolor: '#f8f9fa' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        שורות הזמנה ({orderLines.length})
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>פריט</TableCell>
            <TableCell>תיאור</TableCell>
            <TableCell align="center">כמות</TableCell>
            <TableCell>מחיר</TableCell>
            <TableCell align="center">הנחה %</TableCell>
            <TableCell>סה"כ</TableCell>
            <TableCell>משקל</TableCell>
            <TableCell align="center">מלאי</TableCell>
            {isPending && <TableCell align="center">פעולות</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {orderLines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.lineNumber}</TableCell>
              <TableCell>{line.product}</TableCell>
              <TableCell>{line.description || '-'}</TableCell>
              <TableCell align="center">
                <EditableLineQuantity line={line} orderStatus={orderStatus} />
              </TableCell>
              <TableCell>
                {Number(line.price).toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
              </TableCell>
              <TableCell align="center">
                {line.discount ? `${Number(line.discount)}%` : '-'}
              </TableCell>
              <TableCell>
                {line.totalPrice
                  ? Number(line.totalPrice).toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })
                  : '-'}
              </TableCell>
              <TableCell>{Number(line.weight)} ק"ג</TableCell>
              <TableCell align="center">{line.currentStock}</TableCell>
              {isPending && (
                <TableCell align="center">
                  <IconButton size="small" color="error" onClick={() => handleDelete(line.id, line.product)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Box sx={{ mt: 1, display: 'flex', gap: 3 }}>
        <Typography variant="body2">
          סה"כ משקל: {orderLines.reduce((sum, l) => sum + Number(l.weight), 0).toFixed(1)} ק"ג
        </Typography>
        <Typography variant="body2">
          סה"כ: {orderLines.reduce((sum, l) => {
            if (l.totalPrice) return sum + Number(l.totalPrice);
            return sum + Number(l.price) * l.quantity;
          }, 0).toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
        </Typography>
      </Box>
    </Box>
  );
}

function EditableDeliveryDate({ order, onUpdate }: { order: Order; onUpdate?: (id: number, date: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const startEditing = () => {
    if (!onUpdate) return;
    setValue(format(new Date(order.deliveryDate), 'yyyy-MM-dd'));
    setEditing(true);
  };

  const save = () => {
    if (value && onUpdate) {
      const newDate = new Date(value);
      const currentDate = new Date(order.deliveryDate);
      if (newDate.toDateString() !== currentDate.toDateString()) {
        onUpdate(order.id, new Date(value).toISOString());
      }
    }
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <TextField
        inputRef={inputRef}
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') cancel();
        }}
        size="small"
        variant="standard"
        sx={{ width: 130 }}
        InputProps={{ sx: { fontSize: '0.875rem' } }}
      />
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        cursor: onUpdate ? 'pointer' : 'default',
        '&:hover .edit-icon': { opacity: 1 },
      }}
      onClick={startEditing}
    >
      {format(new Date(order.deliveryDate), 'dd/MM/yyyy')}
      {onUpdate && (
        <EditIcon
          className="edit-icon"
          sx={{ fontSize: 14, opacity: 0, transition: 'opacity 0.2s', color: 'action.active' }}
        />
      )}
    </Box>
  );
}

function OrderRow({ order, onUpdateDeliveryDate }: { order: Order; onUpdateDeliveryDate?: (id: number, date: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const { selectedOrderIds, toggleSelect } = useOrderStore();
  const isSelected = selectedOrderIds.has(order.id);

  const hasMedia = order.delivery && (order.delivery.signatureUrl || order.delivery.photos?.length > 0);

  return (
    <Fragment>
      <TableRow
        hover
        selected={isSelected}
        sx={{ '& > *': { borderBottom: expanded ? 'none !important' : undefined } }}
      >
        <TableCell padding="checkbox">
          <Checkbox
            checked={isSelected}
            onChange={() => toggleSelect(order.id)}
          />
        </TableCell>
        <TableCell padding="none">
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
        </TableCell>
        <TableCell>{order.orderNumber}</TableCell>
        <TableCell><StatusChip status={order.status} /></TableCell>
        <TableCell>
          {order.customerName}
          {order.contactPerson && (
            <Typography variant="caption" color="text.secondary" display="block">
              איש קשר: {order.contactPerson}
            </Typography>
          )}
        </TableCell>
        <TableCell>
          <EditableAddress order={order} />
        </TableCell>
        <TableCell>
          {order.phone}
          {order.phone2 && (
            <Typography variant="caption" color="text.secondary" display="block">
              {order.phone2}
            </Typography>
          )}
        </TableCell>
        <TableCell>
          <EditableDeliveryDate order={order} onUpdate={onUpdateDeliveryDate} />
        </TableCell>
        <TableCell>{order.department ? (DEPARTMENT_LABELS[order.department] || order.department) : '-'}</TableCell>
        <TableCell>{order.zone?.nameHe || 'לא מוגדר'}</TableCell>
        <TableCell align="center">{order.exportedToCsv ? 'כן' : 'לא'}</TableCell>
        <TableCell align="center">{order.sentToChecker ? 'כן' : 'לא'}</TableCell>
        <TableCell>
          <EditableDriverNote order={order} />
        </TableCell>
        <TableCell align="center">{order.orderLines?.length || 0}</TableCell>
        <TableCell align="center"><EditablePalletCount order={order} /></TableCell>
        <TableCell align="center">
          {order.deliveryNoteUrl ? (
            order.signedDeliveryNoteUrl ? (
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
            )
          ) : (
            <Typography variant="caption" color="text.disabled">-</Typography>
          )}
        </TableCell>
        <TableCell align="center">
          {hasMedia ? (
            <Tooltip title="צפה בחתימה ותמונות">
              <IconButton size="small" color="primary" onClick={() => setMediaDialogOpen(true)}>
                <PhotoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            order.delivery ? <Typography variant="caption" color="text.disabled">-</Typography> : null
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={17} sx={{ p: 0, border: expanded ? undefined : 'none' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <OrderLineDetails orderLines={order.orderLines} orderStatus={order.status} />
          </Collapse>
        </TableCell>
      </TableRow>
      {hasMedia && order.delivery && (
        <DeliveryMediaDialog
          open={mediaDialogOpen}
          onClose={() => setMediaDialogOpen(false)}
          orderNumber={order.orderNumber}
          signatureUrl={order.delivery.signatureUrl}
          photos={order.delivery.photos || []}
          deliveryResult={order.delivery.result}
          deliveryNotes={order.delivery.notes}
          deliveredAt={order.delivery.deliveredAt}
        />
      )}
    </Fragment>
  );
}

export default function OrdersTable({ orders, total, loading, onUpdateDeliveryDate }: Props) {
  const { selectedOrderIds, selectAll, clearSelection, filters, setFilters } = useOrderStore();
  const { sortedItems, sortConfig, handleSort } = useSortable(orders);

  const allSelected = orders.length > 0 && orders.every((o) => selectedOrderIds.has(o.id));
  const someSelected = orders.some((o) => selectedOrderIds.has(o.id));

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAll(orders.map((o) => o.id));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell padding="none" sx={{ width: 40 }} />
              <SortableTableCell label="מס' הזמנה" sortKey="orderNumber" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="סטטוס" sortKey="status" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="שם לקוח" sortKey="customerName" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="כתובת" sortKey="city" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="טלפון" sortKey="phone" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="תאריך אספקה" sortKey="deliveryDate" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="מחלקה" sortKey="department" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="אזור" sortKey="zone.nameHe" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="WMS" sortKey="exportedToCsv" sortConfig={sortConfig} onSort={handleSort} align="center" />
              <SortableTableCell label="בודק" sortKey="sentToChecker" sortConfig={sortConfig} onSort={handleSort} align="center" />
              <TableCell>הערה לנהג</TableCell>
              <SortableTableCell label="פריטים" sortKey="orderLines.length" sortConfig={sortConfig} onSort={handleSort} align="center" />
              <SortableTableCell label="משטחים" sortKey="palletCount" sortConfig={sortConfig} onSort={handleSort} align="center" />
              <TableCell align="center">תעודה</TableCell>
              <TableCell align="center">מדיה</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={17} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">אין הזמנות</Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((order) => (
                <OrderRow key={order.id} order={order} onUpdateDeliveryDate={onUpdateDeliveryDate} />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={(filters.page || 1) - 1}
        onPageChange={(_, page) => setFilters({ page: page + 1 })}
        rowsPerPage={filters.pageSize || 50}
        onRowsPerPageChange={(e) => setFilters({ pageSize: parseInt(e.target.value), page: 1 })}
        rowsPerPageOptions={[25, 50, 100]}
        labelRowsPerPage="שורות בעמוד:"
        labelDisplayedRows={({ from, to, count }) =>
          `${from}-${to} מתוך ${count !== -1 ? count : `יותר מ-${to}`}`
        }
      />
    </Paper>
  );
}
