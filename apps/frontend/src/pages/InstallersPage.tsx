import { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Chip, Alert, Snackbar, Tooltip,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { installerApi, InstallerRecord } from '../services/installerApi';
import { zoneApi } from '../services/zoneApi';
import { INSTALLER_DEPARTMENT_LABELS } from '../constants/departments';
import SortableTableCell from '../components/common/SortableTableCell';
import { useSortable } from '../hooks/useSortable';

const INSTALLER_DEPT_OPTIONS = [
  { value: 'SHOWER_INSTALLATION', label: 'מקלחונים' },
  { value: 'INTERIOR_DOOR_INSTALLATION', label: 'דלתות פנים' },
  { value: 'KITCHEN_INSTALLATION', label: 'מטבחים' },
];

const emptyForm = {
  username: '',
  email: '',
  password: '',
  fullName: '',
  phone: '',
  department: 'SHOWER_INSTALLATION',
  zoneId: '' as string | number,
  startTime: '08:00',
  endTime: '17:00',
  finalAddress: '',
};

export default function InstallersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['installers'], queryFn: installerApi.getAll });
  const { data: zonesData } = useQuery({ queryKey: ['zones'], queryFn: zoneApi.getAll });
  const installers: InstallerRecord[] = data?.data || [];
  const zones = zonesData?.data || [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstaller, setEditingInstaller] = useState<InstallerRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const createMutation = useMutation({
    mutationFn: installerApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installers'] });
      setSnackbar({ message: 'מתקין נוסף בהצלחה', severity: 'success' });
      handleClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'שגיאה בהוספת מתקין';
      setSnackbar({ message: msg, severity: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => installerApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installers'] });
      setSnackbar({ message: 'מתקין עודכן', severity: 'success' });
      handleClose();
    },
    onError: () => setSnackbar({ message: 'שגיאה בעדכון מתקין', severity: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: installerApi.delete,
    onSuccess: (_data, _vars, _ctx) => {
      queryClient.invalidateQueries({ queryKey: ['installers'] });
    },
  });

  const handleOpen = (installer?: InstallerRecord) => {
    if (installer) {
      setEditingInstaller(installer);
      setForm({
        username: installer.user.username || '',
        email: installer.user.email || '',
        password: '',
        fullName: installer.user.fullName,
        phone: installer.user.phone || '',
        department: installer.department || 'SHOWER_INSTALLATION',
        zoneId: installer.zone?.id || '',
        startTime: installer.startTime,
        endTime: installer.endTime,
        finalAddress: installer.finalAddress || '',
      });
    } else {
      setEditingInstaller(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingInstaller(null);
    setForm(emptyForm);
  };

  const handleSave = () => {
    if (editingInstaller) {
      const updateData: any = {
        fullName: form.fullName,
        phone: form.phone || null,
        department: form.department,
        zoneId: form.zoneId ? Number(form.zoneId) : null,
        startTime: form.startTime,
        endTime: form.endTime,
        finalAddress: form.finalAddress || null,
      };
      if (form.password) updateData.password = form.password;
      updateMutation.mutate({ id: editingInstaller.id, data: updateData });
    } else {
      createMutation.mutate({
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        fullName: form.fullName,
        phone: form.phone || undefined,
        department: form.department,
        zoneId: form.zoneId ? Number(form.zoneId) : undefined,
        startTime: form.startTime,
        endTime: form.endTime,
        finalAddress: form.finalAddress || undefined,
      });
    }
  };

  const { sortedItems: sortedInstallers, sortConfig, handleSort } = useSortable(installers);

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
          ניהול מתקינים
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
          הוסף מתקין
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableTableCell label="שם מתקין" sortKey="user.fullName" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="שם משתמש" sortKey="user.username" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="טלפון" sortKey="user.phone" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="אזור" sortKey="zone.nameHe" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="שעות עבודה" sortKey="startTime" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="סטטוס" sortKey="user.isActive" sortConfig={sortConfig} onSort={handleSort} />
              <TableCell>פעולות</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedInstallers.map((installer) => (
              <TableRow key={installer.id} hover>
                <TableCell>{installer.user.fullName}</TableCell>
                <TableCell>{installer.user.username}</TableCell>
                <TableCell>{installer.user.phone || '-'}</TableCell>
                <TableCell>{installer.zone?.nameHe || 'לא מוגדר'}</TableCell>
                <TableCell>{installer.startTime} - {installer.endTime}</TableCell>
                <TableCell>
                  <Chip
                    label={installer.user.isActive ? 'פעיל' : 'לא פעיל'}
                    size="small"
                    color={installer.user.isActive ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleOpen(installer)}><EditIcon fontSize="small" /></IconButton>
                  {installer.user.isActive ? (
                    <Tooltip title="השבת מתקין">
                      <IconButton size="small" color="warning" onClick={() => {
                        deleteMutation.mutate(installer.id, {
                          onSuccess: () => setSnackbar({ message: 'מתקין הושבת', severity: 'success' }),
                        });
                      }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="מחיקה לצמיתות">
                      <IconButton size="small" color="error" onClick={() => {
                        if (window.confirm('האם למחוק את המתקין לצמיתות? פעולה זו אינה ניתנת לביטול.')) {
                          deleteMutation.mutate(installer.id, {
                            onSuccess: () => setSnackbar({ message: 'מתקין נמחק לצמיתות', severity: 'success' }),
                          });
                        }
                      }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {installers.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center">אין מתקינים</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingInstaller ? 'עריכת מתקין' : 'הוספת מתקין חדש'}</DialogTitle>
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
              disabled={!!editingInstaller}
            />
            <TextField
              label={editingInstaller ? 'סיסמה חדשה (השאר ריק לללא שינוי)' : 'סיסמה'}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editingInstaller}
            />
            <TextField
              label="טלפון"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <TextField
              select
              label="מחלקה"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              required
            >
              {INSTALLER_DEPT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="אזור"
              value={form.zoneId}
              onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
            >
              <MenuItem value="">ללא אזור</MenuItem>
              {zones.map((zone: any) => (
                <MenuItem key={zone.id} value={zone.id}>{zone.nameHe}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="שעת התחלה"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="שעת סיום"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
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
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.fullName || !form.username || (!editingInstaller && !form.password) || !form.department}
          >
            {editingInstaller ? 'עדכן' : 'הוסף'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
