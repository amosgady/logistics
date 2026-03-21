import { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Switch, FormControlLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Chip, Alert, Snackbar,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { truckApi } from '../services/truckApi';
import { settingsApi } from '../services/settingsApi';
import SortableTableCell from '../components/common/SortableTableCell';
import { useSortable } from '../hooks/useSortable';
import { DEPARTMENT_LABELS, DEPARTMENT_OPTIONS } from '../constants/departments';

interface Truck {
  id: number;
  name: string;
  licensePlate: string;
  size: string;
  hasCrane: boolean;
  truckType: string | null;
  maxWeightKg: string;
  maxPallets: number;
  workHoursPerDay: string;
  waitTimePerStop: number;
  isActive: boolean;
  finalAddress: string | null;
  department: string | null;
}

const emptyTruck = {
  name: '',
  licensePlate: '',
  size: '',
  hasCrane: false,
  truckType: '',
  maxWeightKg: 10000,
  maxPallets: 16,
  workHoursPerDay: 10,
  waitTimePerStop: 15,
  finalAddress: '',
  department: '',
};

export default function TrucksPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['trucks'], queryFn: truckApi.getAll });
  const trucks: Truck[] = data?.data || [];
  const { data: sizesData } = useQuery({ queryKey: ['truck-sizes'], queryFn: settingsApi.getTruckSizes });
  const truckSizes: string[] = sizesData?.data || ['קטנה', 'גדולה'];
  const { data: typesData } = useQuery({ queryKey: ['truck-types'], queryFn: settingsApi.getTruckTypes });
  const truckTypes: string[] = typesData?.data || [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<any>(null);
  const [form, setForm] = useState(emptyTruck);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const createMutation = useMutation({
    mutationFn: truckApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      setSnackbar({ message: 'משאית נוספה בהצלחה', severity: 'success' });
      handleClose();
    },
    onError: () => setSnackbar({ message: 'שגיאה בהוספת משאית', severity: 'error' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => truckApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      setSnackbar({ message: 'משאית עודכנה', severity: 'success' });
      handleClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: truckApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      setSnackbar({ message: 'משאית הוסרה', severity: 'success' });
    },
  });

  const handleOpen = (truck?: Truck) => {
    if (truck) {
      setEditingTruck(truck);
      setForm({
        name: truck.name,
        licensePlate: truck.licensePlate,
        size: truck.size,
        hasCrane: truck.hasCrane,
        maxWeightKg: Number(truck.maxWeightKg),
        maxPallets: truck.maxPallets,
        workHoursPerDay: Number(truck.workHoursPerDay),
        waitTimePerStop: truck.waitTimePerStop,
        finalAddress: truck.finalAddress || '',
        department: truck.department || '',
      });
    } else {
      setEditingTruck(null);
      setForm(emptyTruck);
    }
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingTruck(null);
    setForm(emptyTruck);
  };

  const handleSave = () => {
    const payload = { ...form, department: form.department || null };
    if (editingTruck) {
      updateMutation.mutate({ id: editingTruck.id, data: payload });
    } else {
      createMutation.mutate(payload as any);
    }
  };

  const { sortedItems: sortedTrucks, sortConfig, handleSort } = useSortable(trucks);

  if (isLoading) return <Typography>טוען...</Typography>;

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          bgcolor: '#1e3a5f',
          color: 'white',
          px: 2,
          py: 1,
          mb: 0,
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'white' }}>
          ניהול משאיות
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => handleOpen()}
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          הוסף משאית
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableTableCell label="שם" sortKey="name" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="לוחית רישוי" sortKey="licensePlate" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="גודל" sortKey="size" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="סוג" sortKey="truckType" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label={'משקל מקס\' (ק"ג)'} sortKey="maxWeightKg" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="משטחים מקס'" sortKey="maxPallets" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="שעות עבודה" sortKey="workHoursPerDay" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="המתנה בנקודה (דק')" sortKey="waitTimePerStop" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="מחלקה" sortKey="department" sortConfig={sortConfig} onSort={handleSort} />
              <TableCell>פעולות</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedTrucks.map((truck) => (
              <TableRow key={truck.id} hover>
                <TableCell>{truck.name}</TableCell>
                <TableCell>{truck.licensePlate}</TableCell>
                <TableCell>
                  <Chip
                    label={truck.size || '-'}
                    size="small"
                    color="default"
                  />
                </TableCell>
                <TableCell>{truck.truckType || '-'}</TableCell>
                <TableCell>{Number(truck.maxWeightKg).toLocaleString()}</TableCell>
                <TableCell>{truck.maxPallets}</TableCell>
                <TableCell>{Number(truck.workHoursPerDay)}</TableCell>
                <TableCell>{truck.waitTimePerStop}</TableCell>
                <TableCell>{truck.department ? DEPARTMENT_LABELS[truck.department] || truck.department : '-'}</TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleOpen(truck)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => deleteMutation.mutate(truck.id)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {trucks.length === 0 && (
              <TableRow><TableCell colSpan={10} align="center">אין משאיות</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingTruck ? 'עריכת משאית' : 'הוספת משאית חדשה'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="שם משאית" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <TextField label="לוחית רישוי" value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} required />
            <TextField select label="גודל" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}>
              {truckSizes.map((size) => (
                <MenuItem key={size} value={size}>{size}</MenuItem>
              ))}
            </TextField>
            <TextField select label="סוג משאית" value={form.truckType || ''} onChange={(e) => setForm({ ...form, truckType: e.target.value })}>
              <MenuItem value="">ללא</MenuItem>
              {truckTypes.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <TextField label='משקל מקסימלי (ק"ג)' type="number" value={form.maxWeightKg} onChange={(e) => setForm({ ...form, maxWeightKg: Number(e.target.value) })} />
            <TextField label="כמות משטחים מקסימלית" type="number" value={form.maxPallets} onChange={(e) => setForm({ ...form, maxPallets: Number(e.target.value) })} />
            <TextField label="שעות עבודה ביום" type="number" value={form.workHoursPerDay} onChange={(e) => setForm({ ...form, workHoursPerDay: Number(e.target.value) })} />
            <TextField label="זמן המתנה בנקודה (דקות)" type="number" value={form.waitTimePerStop} onChange={(e) => setForm({ ...form, waitTimePerStop: Number(e.target.value) })} />
            <TextField select label="מחלקה" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <MenuItem value="">ללא</MenuItem>
              {DEPARTMENT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="כתובת סיום"
              value={form.finalAddress}
              onChange={(e) => setForm({ ...form, finalAddress: e.target.value })}
              placeholder="השאר ריק אם אין כתובת סיום קבועה"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>ביטול</Button>
          <Button variant="contained" onClick={handleSave}>
            {editingTruck ? 'עדכן' : 'הוסף'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
