import { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Switch, FormControlLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Chip, Alert, Snackbar,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, UserRecord } from '../services/userApi';
import { DEPARTMENT_LABELS, DEPARTMENT_OPTIONS, ROLE_LABELS } from '../constants/departments';
import SortableTableCell from '../components/common/SortableTableCell';
import { useSortable } from '../hooks/useSortable';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'מנהל לוגיסטי' },
  { value: 'COORDINATOR', label: 'מתאם' },
  { value: 'DRIVER', label: 'נהג' },
  { value: 'INSTALLER', label: 'מתקין' },
];

const emptyForm = {
  username: '',
  email: '',
  password: '',
  fullName: '',
  role: 'COORDINATOR',
  department: '',
  phone: '',
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: userApi.getAll });
  const users: UserRecord[] = data?.data || [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const createMutation = useMutation({
    mutationFn: userApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSnackbar({ message: 'משתמש נוסף בהצלחה', severity: 'success' });
      handleClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'שגיאה בהוספת משתמש';
      setSnackbar({ message: msg, severity: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => userApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSnackbar({ message: 'משתמש עודכן', severity: 'success' });
      handleClose();
    },
    onError: () => setSnackbar({ message: 'שגיאה בעדכון משתמש', severity: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: userApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSnackbar({ message: 'משתמש הושבת', severity: 'success' });
    },
  });

  const handleOpen = (user?: UserRecord) => {
    if (user) {
      setEditingUser(user);
      setForm({
        username: user.username || '',
        email: user.email || '',
        password: '',
        fullName: user.fullName,
        role: user.role,
        department: user.department || '',
        phone: user.phone || '',
      });
    } else {
      setEditingUser(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  };

  const handleSave = () => {
    if (editingUser) {
      const updateData: any = {
        fullName: form.fullName,
        role: form.role,
        department: form.department || null,
        phone: form.phone || null,
        email: form.email || null,
      };
      if (form.username !== editingUser.username) updateData.username = form.username;
      if (form.password) updateData.password = form.password;
      updateMutation.mutate({ id: editingUser.id, data: updateData });
    } else {
      createMutation.mutate({
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        department: form.department || undefined,
        phone: form.phone || undefined,
      });
    }
  };

  const needsDepartment = form.role === 'COORDINATOR';

  const { sortedItems: sortedUsers, sortConfig, handleSort } = useSortable(users);

  if (isLoading) return <Typography>טוען...</Typography>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">ניהול משתמשים</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          הוסף משתמש
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableTableCell label="שם" sortKey="fullName" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="שם משתמש" sortKey="username" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="אימייל" sortKey="email" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="תפקיד" sortKey="role" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="מחלקה" sortKey="department" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="טלפון" sortKey="phone" sortConfig={sortConfig} onSort={handleSort} />
              <SortableTableCell label="פעיל" sortKey="isActive" sortConfig={sortConfig} onSort={handleSort} />
              <TableCell>פעולות</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedUsers.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>{user.fullName}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={ROLE_LABELS[user.role] || user.role}
                    size="small"
                    color={user.role === 'ADMIN' ? 'primary' : 'default'}
                  />
                </TableCell>
                <TableCell>{user.department ? (DEPARTMENT_LABELS[user.department] || user.department) : '-'}</TableCell>
                <TableCell>{user.phone || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={user.isActive ? 'פעיל' : 'לא פעיל'}
                    size="small"
                    color={user.isActive ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleOpen(user)}><EditIcon fontSize="small" /></IconButton>
                  {user.isActive && (
                    <IconButton size="small" color="error" onClick={() => deleteMutation.mutate(user.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow><TableCell colSpan={8} align="center">אין משתמשים</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? 'עריכת משתמש' : 'הוספת משתמש חדש'}</DialogTitle>
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
              helperText="שם המשתמש לכניסה למערכת"
            />
            <TextField
              label="אימייל"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              helperText="לא חובה"
            />
            <TextField
              label={editingUser ? 'סיסמה חדשה (השאר ריק לללא שינוי)' : 'סיסמה'}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editingUser}
            />
            <TextField
              select
              label="תפקיד"
              value={form.role}
              onChange={(e) => {
                const newRole = e.target.value;
                setForm({
                  ...form,
                  role: newRole,
                  department: newRole === 'ADMIN' ? '' : form.department,
                });
              }}
            >
              {ROLE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
            {form.role !== 'ADMIN' && (
              <TextField
                select
                label="מחלקה"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                required={needsDepartment}
                helperText={needsDepartment ? 'חובה לבחור מחלקה למתאם' : ''}
              >
                <MenuItem value="">ללא מחלקה</MenuItem>
                {DEPARTMENT_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="טלפון"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>ביטול</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.fullName || !form.username || (!editingUser && !form.password)}
          >
            {editingUser ? 'עדכן' : 'הוסף'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
