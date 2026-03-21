import {
  Box, TextField, MenuItem, InputAdornment, Button,
  Select, InputLabel, FormControl, Checkbox, ListItemText,
  Chip, OutlinedInput, FormControlLabel, Typography, IconButton, Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  DateRange as DateRangeIcon,
  ChevronRight as NextIcon,
  ChevronLeft as PrevIcon,
} from '@mui/icons-material';
import { useOrderStore } from '../../store/orderStore';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';

function getNearDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'בהמתנה' },
  { value: 'PLANNING', label: 'בתכנון' },
  { value: 'ASSIGNED_TO_TRUCK', label: 'משויך למשאית' },
  { value: 'IN_COORDINATION', label: 'בתיאום' },
  { value: 'APPROVED', label: 'מתואם' },
  { value: 'SENT_TO_DRIVER', label: 'נשלח לנהג' },
  { value: 'COMPLETED', label: 'הושלם' },
  { value: 'CANCELLED', label: 'בוטל' },
];

const STATUS_LABEL_MAP: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label])
);

const DEPT_LABEL_MAP: Record<string, string> = Object.fromEntries(
  DEPARTMENT_OPTIONS.map((o) => [o.value, o.label])
);

export default function OrderFilters() {
  const { filters, setFilters } = useOrderStore();

  const currentDate = filters.deliveryDateFrom || filters.deliveryDateTo || new Date().toISOString().slice(0, 10);

  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {/* Search */}
      <TextField
        placeholder="חיפוש..."
        size="small"
        value={filters.search || ''}
        onChange={(e) => setFilters({ search: e.target.value, page: 1 })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}
      />

      {/* Status */}
      <FormControl size="small" sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}>
        <InputLabel>סטטוס</InputLabel>
        <Select
          multiple
          value={filters.status || []}
          onChange={(e) => {
            const val = e.target.value as string[];
            setFilters({ status: val.length > 0 ? val : undefined, page: 1 });
          }}
          input={<OutlinedInput label="סטטוס" />}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {(selected as string[]).map((v) => (
                <Chip key={v} label={STATUS_LABEL_MAP[v] || v} size="small" />
              ))}
            </Box>
          )}
        >
          {STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              <Checkbox checked={(filters.status || []).includes(opt.value)} size="small" />
              <ListItemText primary={opt.label} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Department */}
      <FormControl size="small" sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}>
        <InputLabel>מחלקה</InputLabel>
        <Select
          multiple
          value={filters.department || []}
          onChange={(e) => {
            const val = e.target.value as string[];
            setFilters({ department: val.length > 0 ? val : undefined, page: 1 });
          }}
          input={<OutlinedInput label="מחלקה" />}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {(selected as string[]).map((v) => (
                <Chip key={v} label={DEPT_LABEL_MAP[v] || v} size="small" />
              ))}
            </Box>
          )}
        >
          {DEPARTMENT_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              <Checkbox checked={(filters.department || []).includes(opt.value)} size="small" />
              <ListItemText primary={opt.label} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* WMS + Checker */}
      <FormControlLabel
        control={
          <Checkbox
            checked={filters.sentToWms || false}
            onChange={(e) => setFilters({ sentToWms: e.target.checked || undefined, page: 1 })}
            size="small"
          />
        }
        label={<Typography variant="body2">WMS</Typography>}
        sx={{ mx: 0 }}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={filters.sentToChecker || false}
            onChange={(e) => setFilters({ sentToChecker: e.target.checked || undefined, page: 1 })}
            size="small"
          />
        }
        label={<Typography variant="body2">בודק</Typography>}
        sx={{ mx: 0 }}
      />

      {/* Separator */}
      <Box sx={{ width: '1px', height: 28, bgcolor: '#ccc', mx: 0.5 }} />

      {/* Date navigation */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        border: '1px solid',
        borderColor: '#ccc',
        borderRadius: 2,
        px: 0.75,
        py: 0.25,
        bgcolor: 'white',
      }}>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
          הזז יום
        </Typography>
        <Tooltip title="יום קודם">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFilters({ deliveryDateFrom: shiftDate(currentDate, -1), deliveryDateTo: shiftDate(currentDate, -1), page: 1 })}>
            <NextIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="יום הבא">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setFilters({ deliveryDateFrom: shiftDate(currentDate, 1), deliveryDateTo: shiftDate(currentDate, 1), page: 1 })}>
            <PrevIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Date range */}
      <TextField
        type="date"
        label="מתאריך אספקה"
        size="small"
        value={filters.deliveryDateFrom || ''}
        onChange={(e) => setFilters({ deliveryDateFrom: e.target.value || undefined, page: 1 })}
        InputLabelProps={{ shrink: true }}
        sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}
      />
      <TextField
        type="date"
        label="עד תאריך אספקה"
        size="small"
        value={filters.deliveryDateTo || ''}
        onChange={(e) => setFilters({ deliveryDateTo: e.target.value || undefined, page: 1 })}
        InputLabelProps={{ shrink: true }}
        sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'white' } }}
      />
      <Button
        variant="outlined"
        size="small"
        startIcon={<DateRangeIcon />}
        onClick={() => {
          const nearDate = getNearDate();
          setFilters({ deliveryDateFrom: nearDate, deliveryDateTo: nearDate, page: 1 });
        }}
        sx={{ whiteSpace: 'nowrap', borderRadius: 2, textTransform: 'none', bgcolor: 'white' }}
      >
        תאריך קרוב
      </Button>
    </Box>
  );
}
