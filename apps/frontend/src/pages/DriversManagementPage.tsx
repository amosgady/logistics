import { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Chip, Alert, Snackbar,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, PersonOff as DeactivateIcon } from '@mui/icons-material';
import Tooltip from '@mui/material/Tooltip';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { driverManagementApi, DriverRecord } from '../services/driverManagementApi';
import { truckApi } from '../services/truckApi';
import SortableTableCell from '../components/common/SortableTableCell';
import { useSortable } from '../hooks/useSortable';

const emptyForm = {
  username: '',
  email: '',
  password: '',
  fullName: '',
  phone: '',
  licenseType: 'B',
  truckId: '' as string | number,
};

export default function DriversManagementPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['drivers-management'], queryFn: driverManagementApi.getAll });
  const { data: trucksData } = useQuery({ queryKey: ['trucks'], queryFn: truckApi.getAll });
  const drivers: DriverRecord[] = data?.data || [];
  const trucks = trucksData?.data || [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const createMutation = useMutation({
    mutationFn: driverManagementApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers-management'] });
      setSnackbar({ message: 'נהג נוסף בהצלחה', severity: 'success' });
      handleClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'שגיאה בהוספת נהג';
      setSnackbar({ message: msg, severity: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => driverManagementApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers-management'] });
      setSnackbar({ message: 'נהג עודכן', severity: 'success' });
      handleClose();
    },
    onError: () => setSnackbar({ message: 'שגיאה בעדכון נהג', severity: 'error' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: driverManagementApi.deactivate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers-management'] });
      setSnackbar({ message: 'נהג הושבת', severity: 'success' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: driverManagementApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers-management'] });
      setSnackbar({ message: 'נהג נמחק לצמיתות', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה במחיקת נהג', severity: 'error' }),
  });

  const handleOpen = (driver?: DriverRecord) => {
    if (driver) {
      setEditingDriver(driver);
      const activeAssignment = driver.truckAssignment?.[0];
      setForm({
        username: driver.user.username || '',
        email: driver.user.email || '',
        password: '',
        fullName: driver.user.fullName,
        phone: driver.user.phone || '',
        licenseType: driver.licenseType,
        truckId: activeAssignment?.truck?.id || '',
      });
    } else {
      setEditingDriver(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingDriver(null);
    setForm(emptyForm);
  };

  const handleSave = () => {
    if (editingDriver) {
      const updateData: any = {
        fullName: form.fullName,
        phone: form.phone || null,
        licenseType: form.licenseType,
        truckId: form.truckId ? Number(form.truckId) : null,
      };
      if (form.password) updateData.password = form.password;
      updateMutation.mutate({ id: editingDriver.id, data: updateData });
    } else {
      createMutation.mutate({
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        fullName: form.fullName,
        phone: form.phone || undefined,
        licenseType: form.licenseType,
        truckId: form.truckId ? Number(form.truckId) : undefined,
      });
    }
  };

  const { sortedItems: sortedDrivers, sortConfig, handleSort } = useSortable(drivers);

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
          ניהול נהגים
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
          הוסף נהג
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableTableCell label="שם נהג" sortKey="user.fullName" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="שם משתמש" sortKey="user.username" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="טלפון" sortKey="user.phone" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="סוג רישיון" sortKey="licenseType" sortConfig={sortConfig} onSort={handleSort} />
              <TableCell>משאית משויכת</TableCell>
              <SortableTableCell label="סטטוס" sortKey="user.isActive" sortConfig={sortConfig} onSort={handleSort} />
              <TableCell>פעולות</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedDrivers.map((driver) => {
              const activeAssignment = driver.truckAssignment?.[0];
              return (
                <TableRow key={driver.id} hover>
                  <TableCell>{driver.user.fullName}</TableCell>
                  <TableCell>{driver.user.username}</TableCell>
                  <TableCell>{driver.user.phone || '-'}</TableCell>
                  <TableCell>{driver.licenseType}</TableCell>
                  <TableCell>
                    {activeAssignment ? (
                      <Chip
                        label={`${activeAssignment.truck.name} (${activeAssignment.truck.licensePlate})`}
                        size="small"
                        color="primary"
                      />
                    ) : (
                      <Chip label="לא משויך" size="small" color="default" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={driver.user.isActive ? 'פעיל' : 'לא פעיל'}
                      size="small"
                      color={driver.user.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleOpen(driver)}><EditIcon fontSize="small" /></IconButton>
                    {driver.user.isActive && (
                      <Tooltip title="השבת נהג">
                        <IconButton size="small" color="warning" onClick={() => deactivateMutation.mutate(driver.id)}>
                          <DeactivateIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="מחק לצמיתות">
                      <IconButton size="small" color="error" onClick={() => {
                        if (window.confirm('האם אתה בטוח שברצונך למחוק את הנהג לצמיתות? פעולה זו בלתי הפיכה.')) {
                          deleteMutation.mutate(driver.id);
                        }
                      }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {drivers.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center">אין נהגים</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingDriver ? 'עריכת נהג' : 'הוספת נהג חדש'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="שם מלא"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
            <TextField
              label="שם משתמש"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              disabled={!!editingDriver}
            />
            <TextField
              label={editingDriver ? 'סיסמה חדשה (השאר ריק לללא שינוי)' : 'סיסמה'}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editingDriver}
            />
            <TextField
              label="טלפון"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <TextField
              select
              label="סוג רישיון"
              value={form.licenseType}
              onChange={(e) => setForm({ ...form, licenseType: e.target.value })}
            >
              <MenuItem value="B">B</MenuItem>
              <MenuItem value="C">C</MenuItem>
              <MenuItem value="C1">C1</MenuItem>
              <MenuItem value="CE">CE</MenuItem>
            </TextField>
            <TextField
              select
              label="משאית"
              value={form.truckId}
              onChange={(e) => setForm({ ...form, truckId: e.target.value })}
            >
              <MenuItem value="">ללא שיוך</MenuItem>
              {trucks.map((truck: any) => (
                <MenuItem key={truck.id} value={truck.id}>
                  {truck.name} ({truck.licensePlate})
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>ביטול</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.fullName || !form.username || (!editingDriver && !form.password)}
          >
            {editingDriver ? 'עדכן' : 'הוסף'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
