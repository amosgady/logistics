import {
  Box, TextField, MenuItem, InputAdornment, Button,
  Select, InputLabel, FormControl, Checkbox, ListItemText,
  Chip, OutlinedInput, FormControlLabel,
} from '@mui/material';
import { Search as SearchIcon, DateRange as DateRangeIcon } from '@mui/icons-material';
import { useOrderStore } from '../../store/orderStore';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';
import DateNavigator from '../common/DateNavigator';

function getNearDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'בהמתנה' },
  { value: 'PLANNING', label: 'בתכנון' },
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

  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
      <TextField
        placeholder="חיפוש..."
        value={filters.search || ''}
        onChange={(e) => setFilters({ search: e.target.value, page: 1 })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ minWidth: 250 }}
      />
      <FormControl sx={{ minWidth: 200 }}>
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
      <FormControl sx={{ minWidth: 200 }}>
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
      <DateNavigator
        date={filters.deliveryDateFrom || filters.deliveryDateTo || new Date().toISOString().slice(0, 10)}
        onDateChange={(d) => setFilters({ deliveryDateFrom: d, deliveryDateTo: d, page: 1 })}
      />
      <TextField
        type="date"
        label="מתאריך אספקה"
        value={filters.deliveryDateFrom || ''}
        onChange={(e) => setFilters({ deliveryDateFrom: e.target.value || undefined, page: 1 })}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        type="date"
        label="עד תאריך אספקה"
        value={filters.deliveryDateTo || ''}
        onChange={(e) => setFilters({ deliveryDateTo: e.target.value || undefined, page: 1 })}
        InputLabelProps={{ shrink: true }}
      />
      <Button
        variant="outlined"
        startIcon={<DateRangeIcon />}
        onClick={() => {
          const nearDate = getNearDate();
          setFilters({ deliveryDateFrom: nearDate, deliveryDateTo: nearDate, page: 1 });
        }}
        sx={{ whiteSpace: 'nowrap' }}
      >
        תאריך קרוב
      </Button>
      <FormControlLabel
        control={
          <Checkbox
            checked={filters.sentToWms || false}
            onChange={(e) => setFilters({ sentToWms: e.target.checked || undefined, page: 1 })}
            size="small"
          />
        }
        label="נשלח ל-WMS"
        sx={{ whiteSpace: 'nowrap' }}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={filters.sentToChecker || false}
            onChange={(e) => setFilters({ sentToChecker: e.target.checked || undefined, page: 1 })}
            size="small"
          />
        }
        label="נשלח לבודק"
        sx={{ whiteSpace: 'nowrap' }}
      />
    </Box>
  );
}
