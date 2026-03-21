import { useState, Fragment, useRef, useEffect, useCallback, ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
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
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
} from '@mui/material';
import {
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  Edit as EditIcon,
  Photo as PhotoIcon,
  PictureAsPdf as PdfIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  StickyNote2 as NoteIcon,
  MyLocation as CoordIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StatusChip from '../common/StatusChip';
import SortableTableCell from '../common/SortableTableCell';
import DeliveryMediaDialog from '../common/DeliveryMediaDialog';
import { useOrderStore } from '../../store/orderStore';
import { useAuthStore } from '../../store/authStore';
import { DEPARTMENT_LABELS, DEPARTMENT_OPTIONS } from '../../constants/departments';
import { orderApi } from '../../services/orderApi';
import { zoneApi } from '../../services/zoneApi';
import { useSortable, SortConfig } from '../../hooks/useSortable';

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
  checkerNote: string | null;
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
  doorCount: number | null;
  handleCount: number | null;
  zone: { id: number; nameHe: string } | null;
  coordinationStatus: string;
  sentToDriver: boolean;
  exportedToCsv: boolean;
  sentToChecker: boolean;
  driverNote: string | null;
  checkerNote: string | null;
  deliveryNoteUrl: string | null;
  signedDeliveryNoteUrl: string | null;
  price: string | null;
  geocodedAddress: string | null;
  geocodeValid: boolean | null;
  orderLines: OrderLine[];
  delivery: Delivery | null;
}

interface Props {
  orders: Order[];
  total: number;
  loading: boolean;
  onUpdateDeliveryDate?: (id: number, deliveryDate: string) => void;
}

// --- Column definition ---
interface ColumnDef {
  id: string;
  label: string;
  sortKey?: string;
  align?: 'left' | 'center' | 'right';
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'orderNumber', label: "מס' הזמנה", sortKey: 'orderNumber' },
  { id: 'orderDate', label: 'תאריך הזמנה', sortKey: 'orderDate' },
  { id: 'status', label: 'סטטוס', sortKey: 'status' },
  { id: 'customerName', label: 'שם לקוח', sortKey: 'customerName' },
  { id: 'address', label: 'כתובת', sortKey: 'city' },
  { id: 'phone', label: 'טלפון', sortKey: 'phone' },
  { id: 'deliveryDate', label: 'תאריך אספקה', sortKey: 'deliveryDate' },
  { id: 'department', label: 'מחלקה', sortKey: 'department' },
  { id: 'zone', label: 'אזור', sortKey: 'zone.nameHe' },
  { id: 'wms', label: 'WMS', sortKey: 'exportedToCsv', align: 'center' },
  { id: 'checker', label: 'בודק', sortKey: 'sentToChecker', align: 'center' },
  { id: 'driverNote', label: 'הערה לנהג' },
  { id: 'checkerNote', label: 'הערת בודק' },
  { id: 'items', label: 'פריטים', sortKey: 'orderLines.length', align: 'center' },
  { id: 'pallets', label: 'משטחים', sortKey: 'palletCount', align: 'center' },
  { id: 'doors', label: 'דלתות', sortKey: 'doorCount', align: 'center' },
  { id: 'handles', label: 'ידיות', sortKey: 'handleCount', align: 'center' },
  { id: 'price', label: 'מחיר' },
  { id: 'geocodedAddress', label: 'כתובת גוגל' },
  { id: 'deliveryNote', label: 'תעודה', align: 'center' },
  { id: 'media', label: 'מדיה', align: 'center' },
];

const DEFAULT_COLUMN_ORDER = ALL_COLUMNS.map((c) => c.id);

function getStorageKey(userId: number | undefined) {
  return `orders-column-order-${userId || 'default'}`;
}

function loadColumnOrder(userId: number | undefined): string[] {
  try {
    const saved = localStorage.getItem(getStorageKey(userId));
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      const validIds = new Set(ALL_COLUMNS.map((c) => c.id));
      const filtered = parsed.filter((id) => validIds.has(id));
      // Add any new columns that weren't in saved order
      for (const col of ALL_COLUMNS) {
        if (!filtered.includes(col.id)) filtered.push(col.id);
      }
      return filtered;
    }
  } catch { /* ignore */ }
  return DEFAULT_COLUMN_ORDER;
}

function saveColumnOrder(userId: number | undefined, order: string[]) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(order));
}

// --- Editable components ---

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

function EditablePrice({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.price || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (price: string) => orderApi.updatePrice(order.id, price),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== (order.price || '')) {
      mutation.mutate(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <TextField
        inputRef={inputRef}
        size="small"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        variant="standard"
        sx={{ width: 80, fontSize: 13 }}
      />
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{ cursor: 'pointer', minWidth: 40, '&:hover': { bgcolor: 'action.hover', borderRadius: 1 }, px: 0.5 }}
      onClick={() => { setValue(order.price || ''); setEditing(true); }}
    >
      {order.price || '-'}
    </Typography>
  );
}

function CoordinateEditor({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [coordText, setCoordText] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) => orderApi.updateCoordinates(order.id, lat, lng),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setOpen(false);
    },
  });

  const handleSave = () => {
    setError('');
    // Parse "31.2543, 34.7891" or "31.2543 34.7891"
    const cleaned = coordText.trim().replace(/\s+/g, ' ');
    const parts = cleaned.split(/[,\s]+/).filter(Boolean);
    if (parts.length !== 2) {
      setError('הזן קואורדינטות בפורמט: lat, lng (למשל 31.2543, 34.7891)');
      return;
    }
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng) || lat < 29 || lat > 34 || lng < 34 || lng > 36) {
      setError('קואורדינטות לא תקינות. ודא שהן בטווח ישראל');
      return;
    }
    mutation.mutate({ lat, lng });
  };

  return (
    <>
      <Tooltip title="עדכן קואורדינטות ידנית">
        <IconButton size="small" color="warning" onClick={() => { setCoordText(''); setError(''); setOpen(true); }}>
          <CoordIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>עדכון קואורדינטות ידני</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>{order.address}, {order.city}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            חפש את הכתובת ב-Google Maps, לחץ ימני על הנקודה, והעתק את הקואורדינטות. הדבק כאן:
          </Typography>
          <TextField
            fullWidth
            label="קואורדינטות (lat, lng)"
            placeholder="31.2543, 34.7891"
            value={coordText}
            onChange={(e) => setCoordText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            sx={{ mt: 1 }}
            autoFocus
          />
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? 'שומר...' : 'שמור'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function EditableOptionalCount({ order, field, updateFn }: { order: Order; field: 'doorCount' | 'handleCount'; updateFn: (orderId: number, value: number | null) => Promise<any> }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order[field] != null ? String(order[field]) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (val: number | null) => updateFn(order.id, val),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const save = () => {
    const trimmed = value.trim();
    if (trimmed === '') {
      if (order[field] != null) mutation.mutate(null);
    } else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && num >= 0 && num !== order[field]) {
        mutation.mutate(num);
      }
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
      onClick={() => { setValue(order[field] != null ? String(order[field]) : ''); setEditing(true); }}
    >
      {order[field] != null ? order[field] : '-'}
      <EditIcon className="edit-icon" sx={{ fontSize: 12, opacity: 0, transition: 'opacity 0.2s', color: 'action.active' }} />
    </Box>
  );
}

function EditableAddress({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [editingAddress, setEditingAddress] = useState(false);
  const [editingCity, setEditingCity] = useState(false);
  const [addressValue, setAddressValue] = useState(order.address);
  const [cityValue, setCityValue] = useState(order.city);
  const addressRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAddress && addressRef.current) {
      addressRef.current.focus();
      addressRef.current.select();
    }
  }, [editingAddress]);

  useEffect(() => {
    if (editingCity && cityRef.current) {
      cityRef.current.focus();
      cityRef.current.select();
    }
  }, [editingCity]);

  const addressMutation = useMutation({
    mutationFn: (address: string) => orderApi.updateAddress(order.id, address),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const cityMutation = useMutation({
    mutationFn: (city: string) => orderApi.updateCity(order.id, city),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const saveAddress = () => {
    const trimmed = addressValue.trim();
    if (trimmed && trimmed !== order.address) {
      addressMutation.mutate(trimmed);
    }
    setEditingAddress(false);
  };

  const saveCity = () => {
    const trimmed = cityValue.trim();
    if (trimmed && trimmed !== order.city) {
      cityMutation.mutate(trimmed);
    }
    setEditingCity(false);
  };

  if (editingAddress) {
    return (
      <Box>
        <TextField
          inputRef={addressRef}
          value={addressValue}
          onChange={(e) => setAddressValue(e.target.value)}
          onBlur={saveAddress}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveAddress();
            if (e.key === 'Escape') setEditingAddress(false);
          }}
          size="small"
          variant="standard"
          fullWidth
          inputProps={{ style: { fontSize: 14 } }}
          placeholder="כתובת"
        />
        <Typography variant="caption" color="text.secondary">{order.city}</Typography>
      </Box>
    );
  }

  if (editingCity) {
    return (
      <Box>
        <Typography variant="body2">{order.address}</Typography>
        <TextField
          inputRef={cityRef}
          value={cityValue}
          onChange={(e) => setCityValue(e.target.value)}
          onBlur={saveCity}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveCity();
            if (e.key === 'Escape') setEditingCity(false);
          }}
          size="small"
          variant="standard"
          fullWidth
          inputProps={{ style: { fontSize: 13 } }}
          placeholder="עיר"
        />
      </Box>
    );
  }

  return (
    <Box sx={{ '&:hover .edit-icon': { opacity: 1 } }}>
      <Box
        sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
        onClick={() => { setAddressValue(order.address); setEditingAddress(true); }}
      >
        <span>{order.address}</span>
        <EditIcon className="edit-icon" sx={{ fontSize: 12, opacity: 0, transition: 'opacity 0.2s', color: 'action.active' }} />
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
        onClick={() => { setCityValue(order.city); setEditingCity(true); }}
      >
        {order.city}
      </Typography>
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

function EditableDepartment({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (department: string) => orderApi.updateDepartment(order.id, department),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
    },
  });

  return (
    <Select
      value={order.department || ''}
      onChange={(e) => {
        const val = e.target.value as string;
        if (val) mutation.mutate(val);
      }}
      size="small"
      variant="standard"
      displayEmpty
      sx={{ fontSize: 13, minWidth: 100 }}
    >
      <MenuItem value="" disabled>-</MenuItem>
      {DEPARTMENT_OPTIONS.map((d) => (
        <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
      ))}
    </Select>
  );
}

function EditableZone({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const { data: zonesData } = useQuery({ queryKey: ['zones'], queryFn: zoneApi.getAll, staleTime: 60000 });
  const zones = zonesData?.data || [];

  const zoneMutation = useMutation({
    mutationFn: (zoneId: number) => orderApi.updateZone(order.id, zoneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['planning-board'] });
    },
  });

  return (
    <Select
      value={order.zone?.id || ''}
      onChange={(e) => {
        const val = e.target.value as number;
        if (val) zoneMutation.mutate(val);
      }}
      size="small"
      variant="standard"
      displayEmpty
      sx={{ fontSize: 13, minWidth: 80 }}
    >
      <MenuItem value="" disabled>לא מוגדר</MenuItem>
      {zones.map((z: any) => (
        <MenuItem key={z.id} value={z.id}>{z.nameHe}</MenuItem>
      ))}
    </Select>
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
            <TableCell>הערת בודק</TableCell>
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
              <TableCell sx={{ color: line.checkerNote ? 'warning.main' : 'text.secondary', fontStyle: line.checkerNote ? 'normal' : 'italic' }}>
                {line.checkerNote || '-'}
              </TableCell>
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

// --- Cell renderer ---
function renderCellContent(
  colId: string,
  order: Order,
  onUpdateDeliveryDate?: (id: number, date: string) => void,
): ReactNode {
  switch (colId) {
    case 'orderNumber':
      return order.orderNumber;
    case 'orderDate':
      return format(new Date(order.orderDate), 'dd/MM/yyyy');
    case 'status':
      return <StatusChip status={order.status} />;
    case 'customerName':
      return (
        <>
          {order.customerName}
          {order.contactPerson && (
            <Typography variant="caption" color="text.secondary" display="block">
              איש קשר: {order.contactPerson}
            </Typography>
          )}
        </>
      );
    case 'address':
      return <EditableAddress order={order} />;
    case 'phone':
      return (
        <>
          {order.phone}
          {order.phone2 && (
            <Typography variant="caption" color="text.secondary" display="block">
              {order.phone2}
            </Typography>
          )}
        </>
      );
    case 'deliveryDate':
      return <EditableDeliveryDate order={order} onUpdate={onUpdateDeliveryDate} />;
    case 'department':
      return <EditableDepartment order={order} />;
    case 'zone':
      return <EditableZone order={order} />;
    case 'wms':
      return order.exportedToCsv ? 'כן' : 'לא';
    case 'checker':
      return order.sentToChecker ? 'כן' : 'לא';
    case 'driverNote':
      return <EditableDriverNote order={order} />;
    case 'checkerNote':
      return order.checkerNote ? (
        <Typography variant="body2" sx={{ color: 'warning.main', maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {order.checkerNote}
        </Typography>
      ) : <Typography variant="caption" color="text.disabled">-</Typography>;
    case 'items':
      return order.orderLines?.length || 0;
    case 'pallets':
      return <EditablePalletCount order={order} />;
    case 'doors':
      return <EditableOptionalCount order={order} field="doorCount" updateFn={orderApi.updateDoorCount} />;
    case 'handles':
      return <EditableOptionalCount order={order} field="handleCount" updateFn={orderApi.updateHandleCount} />;
    case 'price':
      return <EditablePrice order={order} />;
    case 'geocodedAddress':
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {order.geocodedAddress ? (
            <Typography
              variant="caption"
              sx={{
                color: order.geocodeValid === false ? 'error.main' : 'text.primary',
                fontWeight: order.geocodeValid === false ? 'bold' : 'normal',
                bgcolor: order.geocodeValid === false ? 'error.50' : undefined,
                px: order.geocodeValid === false ? 0.5 : 0,
                borderRadius: 0.5,
              }}
            >
              {order.geocodedAddress}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.disabled">-</Typography>
          )}
          <CoordinateEditor order={order} />
        </Box>
      );
    case 'deliveryNote':
      return order.deliveryNoteUrl ? (
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
      );
    case 'media':
      return null; // handled specially in OrderRow
    default:
      return null;
  }
}

// --- Draggable header ---
function DraggableHeader({
  col,
  sortConfig,
  onSort,
  onDragStart,
  onDragOver,
  onDrop,
  dragOverId,
}: {
  col: ColumnDef;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (id: string) => void;
  dragOverId: string | null;
}) {
  const isDragOver = dragOverId === col.id;

  if (col.sortKey) {
    return (
      <SortableTableCell
        label={col.label}
        sortKey={col.sortKey}
        sortConfig={sortConfig}
        onSort={onSort}
        align={col.align}
        draggable
        onDragStart={() => onDragStart(col.id)}
        onDragOver={(e: React.DragEvent) => onDragOver(e, col.id)}
        onDrop={() => onDrop(col.id)}
        onDragEnd={() => onDrop('')}
        sx={{
          cursor: 'grab',
          borderRight: isDragOver ? '2px solid #1976d2' : undefined,
          '&:active': { cursor: 'grabbing' },
        }}
      />
    );
  }

  return (
    <TableCell
      align={col.align}
      draggable
      onDragStart={() => onDragStart(col.id)}
      onDragOver={(e: React.DragEvent) => onDragOver(e, col.id)}
      onDrop={() => onDrop(col.id)}
      onDragEnd={() => onDrop('')}
      sx={{
        cursor: 'grab',
        borderRight: isDragOver ? '2px solid #1976d2' : undefined,
        '&:active': { cursor: 'grabbing' },
        fontWeight: 700,
        color: '#1e3a5f',
      }}
    >
      {col.label}
    </TableCell>
  );
}

// --- Order row ---
function OrderRow({
  order,
  columnOrder,
  onUpdateDeliveryDate,
}: {
  order: Order;
  columnOrder: string[];
  onUpdateDeliveryDate?: (id: number, date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const { selectedOrderIds, toggleSelect } = useOrderStore();
  const isSelected = selectedOrderIds.has(order.id);

  const hasMedia = order.delivery && (order.delivery.signatureUrl || order.delivery.photos?.length > 0);
  const hasCheckerNotes = order.orderLines?.some((l) => l.checkerNote);
  const colMap = Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c]));
  const totalCols = columnOrder.length + 2; // +2 for checkbox and expand

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
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
            {hasCheckerNotes && (
              <Tooltip title="יש הערות בודק בשורות">
                <NoteIcon sx={{ fontSize: 16, color: 'warning.main' }} />
              </Tooltip>
            )}
          </Box>
        </TableCell>
        {columnOrder.map((colId) => {
          const col = colMap[colId];
          if (!col) return null;
          if (colId === 'media') {
            return (
              <TableCell key={colId} align="center">
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
            );
          }
          return (
            <TableCell key={colId} align={col.align}>
              {renderCellContent(colId, order, onUpdateDeliveryDate)}
            </TableCell>
          );
        })}
      </TableRow>
      <TableRow>
        <TableCell colSpan={totalCols} sx={{ p: 0, border: expanded ? undefined : 'none' }}>
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

// --- Main table ---
export default function OrdersTable({ orders, total, loading, onUpdateDeliveryDate }: Props) {
  const { selectedOrderIds, selectAll, clearSelection, filters, setFilters } = useOrderStore();
  const userId = useAuthStore((s) => s.user?.id);
  const { sortedItems, sortConfig, handleSort } = useSortable(orders);

  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnOrder(userId));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Update column order when userId changes (after login)
  useEffect(() => {
    setColumnOrder(loadColumnOrder(userId));
  }, [userId]);

  const handleDragStart = useCallback((id: string) => {
    setDragId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  }, []);

  const handleDrop = useCallback((targetId: string) => {
    if (dragId && targetId && dragId !== targetId) {
      setColumnOrder((prev) => {
        const newOrder = [...prev];
        const fromIdx = newOrder.indexOf(dragId);
        const toIdx = newOrder.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, dragId);
        saveColumnOrder(userId, newOrder);
        return newOrder;
      });
    }
    setDragId(null);
    setDragOverId(null);
  }, [dragId, userId]);

  const allSelected = orders.length > 0 && orders.every((o) => selectedOrderIds.has(o.id));
  const someSelected = orders.some((o) => selectedOrderIds.has(o.id));

  const [selectingAll, setSelectingAll] = useState(false);
  const handleSelectAll = async () => {
    if (allSelected || selectedOrderIds.size > 0) {
      clearSelection();
    } else {
      // Fetch ALL order IDs matching current filters (not just current page)
      setSelectingAll(true);
      try {
        const { page, pageSize, ...filterParams } = filters;
        const result = await orderApi.getAllOrderIds(filterParams);
        const ids: number[] = result.data || result;
        if (Array.isArray(ids) && ids.length > 0) {
          selectAll(ids);
        } else {
          selectAll(orders.map((o) => o.id));
        }
      } catch (e) {
        console.error('getAllOrderIds failed', e);
        selectAll(orders.map((o) => o.id));
      } finally {
        setSelectingAll(false);
      }
    }
  };

  const colMap = Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c]));
  const totalCols = columnOrder.length + 2;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <Box sx={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
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
              {columnOrder.map((colId) => {
                const col = colMap[colId];
                if (!col) return null;
                return (
                  <DraggableHeader
                    key={colId}
                    col={col}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    dragOverId={dragOverId}
                  />
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalCols} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">אין הזמנות</Typography>
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  columnOrder={columnOrder}
                  onUpdateDeliveryDate={onUpdateDeliveryDate}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Box>
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
        sx={{ display: 'flex', justifyContent: 'center', '.MuiTablePagination-toolbar': { justifyContent: 'center' } }}
      />
    </Paper>
  );
}
