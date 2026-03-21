import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
} from '@mui/material';
import {
  Upload as ImportIcon,
  MoveDown as MoveIcon,
  Cancel as CancelIcon,
  Undo as RevertIcon,
  Delete as DeleteIcon,
  CalendarMonth as CalendarIcon,
  Map as MapIcon,
  LocationOn as LocationIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import OrdersTable from '../components/orders/OrdersTable';
import OrderFilters from '../components/orders/OrderFilters';
import CsvImportDialog from '../components/orders/CsvImportDialog';
import DeleteConfirmDialog from '../components/orders/DeleteConfirmDialog';
import { useOrders, useBulkChangeStatus, useBulkDelete, useUpdateDeliveryDate, useBulkUpdateDeliveryDate } from '../hooks/useOrders';
import { useOrderStore } from '../store/orderStore';
import { zoneApi } from '../services/zoneApi';
import { orderApi } from '../services/orderApi';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function OrdersPage() {
  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDateDialogOpen, setBulkDateDialogOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false);
  const { data, isLoading, error } = useOrders();
  const bulkStatusMutation = useBulkChangeStatus();
  const bulkDeleteMutation = useBulkDelete();
  const bulkDeliveryDateMutation = useBulkUpdateDeliveryDate();
  const deliveryDateMutation = useUpdateDeliveryDate();
  const selectedOrderIds = useOrderStore((s) => s.selectedOrderIds);
  const queryClient = useQueryClient();

  const reassignZonesMutation = useMutation({
    mutationFn: () => zoneApi.reassignZonesPending(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      const { assigned, unmatched } = result.data;
      setSnackbar({
        message: `שויכו ${assigned} הזמנות לאזורים${unmatched > 0 ? `. ${unmatched} ללא התאמה` : ''}`,
        severity: unmatched > 0 ? 'warning' : 'success',
      });
    },
    onError: () => setSnackbar({ message: 'שגיאה בשיוך אזורים', severity: 'error' }),
  });

  const validateAddressesMutation = useMutation({
    mutationFn: (orderIds: number[]) => orderApi.validateAddresses(orderIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      const { geocoded, failed } = result.data || {};
      setSnackbar({
        message: `אימות כתובות הושלם: ${geocoded || 0} תקינות, ${failed || 0} חשודות`,
        severity: failed > 0 ? 'warning' as any : 'success',
      });
    },
    onError: () => setSnackbar({ message: 'שגיאה באימות כתובות', severity: 'error' }),
  });

  const orders = data?.data || [];
  const total = data?.meta?.total || 0;

  // Check if some selected orders are NOT on the current page (cross-page selection)
  const hasCrossPageSelection = selectedOrderIds.size > 0 &&
    Array.from(selectedOrderIds).some((id) => !orders.find((o: any) => o.id === id));

  const allSelectedDeletable = selectedOrderIds.size > 0 && (hasCrossPageSelection ||
    Array.from(selectedOrderIds).every((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'PENDING' || order?.status === 'CANCELLED';
    }));

  const hasLockedOrders = !hasCrossPageSelection && selectedOrderIds.size > 0 &&
    Array.from(selectedOrderIds).some((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'SENT_TO_DRIVER' || order?.status === 'COMPLETED';
    });

  const allSelectedInPlanning = selectedOrderIds.size > 0 && (hasCrossPageSelection ||
    Array.from(selectedOrderIds).every((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'PLANNING';
    }));

  const allSelectedPending = selectedOrderIds.size > 0 && (hasCrossPageSelection ||
    Array.from(selectedOrderIds).every((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'PENDING';
    }));

  const handleMoveToPlanning = async () => {
    if (selectedOrderIds.size === 0) return;
    try {
      const result = await bulkStatusMutation.mutateAsync({
        orderIds: Array.from(selectedOrderIds),
        targetStatus: 'PLANNING',
      });
      setSnackbar({
        message: `${result.data.success.length} הזמנות הועברו לתכנון`,
        severity: 'success',
      });
    } catch {
      setSnackbar({ message: 'שגיאה בהעברה לתכנון', severity: 'error' });
    }
  };

  const handleCancel = async () => {
    if (selectedOrderIds.size === 0) return;
    try {
      const result = await bulkStatusMutation.mutateAsync({
        orderIds: Array.from(selectedOrderIds),
        targetStatus: 'CANCELLED',
      });
      setSnackbar({
        message: `${result.data.success.length} הזמנות בוטלו`,
        severity: 'success',
      });
    } catch {
      setSnackbar({ message: 'שגיאה בביטול', severity: 'error' });
    }
  };

  const handleRevertToPending = async () => {
    if (selectedOrderIds.size === 0) return;
    try {
      const result = await bulkStatusMutation.mutateAsync({
        orderIds: Array.from(selectedOrderIds),
        targetStatus: 'PENDING',
      });
      setSnackbar({
        message: `${result.data.success.length} הזמנות הוחזרו להמתנה`,
        severity: 'success',
      });
    } catch {
      setSnackbar({ message: 'שגיאה בהחזרה להמתנה', severity: 'error' });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const result = await bulkDeleteMutation.mutateAsync(Array.from(selectedOrderIds));
      setDeleteDialogOpen(false);
      const successCount = result.data.success.length;
      const failedCount = result.data.failed.length;
      if (failedCount > 0) {
        setSnackbar({
          message: `${successCount} נמחקו, ${failedCount} נכשלו (ניתן למחוק רק הזמנות בהמתנה או שבוטלו)`,
          severity: successCount > 0 ? 'success' : 'error',
        });
      } else {
        setSnackbar({
          message: `${successCount} הזמנות נמחקו`,
          severity: 'success',
        });
      }
    } catch {
      setSnackbar({ message: 'שגיאה במחיקה', severity: 'error' });
    }
  };

  const handleBulkDeliveryDate = async () => {
    if (selectedOrderIds.size === 0 || !bulkDate) return;
    try {
      const result = await bulkDeliveryDateMutation.mutateAsync({
        orderIds: Array.from(selectedOrderIds),
        deliveryDate: new Date(bulkDate).toISOString(),
      });
      setBulkDateDialogOpen(false);
      setBulkDate('');
      setSnackbar({
        message: `תאריך אספקה עודכן ל-${result.data.updated} הזמנות`,
        severity: 'success',
      });
    } catch {
      setSnackbar({ message: 'שגיאה בעדכון תאריך אספקה', severity: 'error' });
    }
  };

  return (
    <Box>
      {/* Dark header bar - inspired by Nimble CRM */}
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
          gap: 1,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'white', ml: 1 }}>
          הזמנות
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', ml: 1 }}>
          ({total})
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<MapIcon />}
          onClick={() => reassignZonesMutation.mutate()}
          disabled={reassignZonesMutation.isPending}
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          שיוך אזורים
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<LocationIcon />}
          onClick={() => {
            const ids = selectedOrderIds.size > 0
              ? Array.from(selectedOrderIds)
              : orders.map((o: any) => o.id);
            validateAddressesMutation.mutate(ids);
          }}
          disabled={validateAddressesMutation.isPending}
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          {validateAddressesMutation.isPending ? 'מאמת...' : `אימות כתובות${selectedOrderIds.size > 0 ? ` (${selectedOrderIds.size})` : ''}`}
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<WarningIcon />}
          onClick={() => setShowSuspiciousOnly(!showSuspiciousOnly)}
          sx={{
            bgcolor: showSuspiciousOnly ? '#f44336' : 'rgba(255,255,255,0.15)',
            color: 'white',
            '&:hover': { bgcolor: showSuspiciousOnly ? '#d32f2f' : 'rgba(255,255,255,0.25)' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          {showSuspiciousOnly ? 'הצג הכל' : 'כתובות חשודות'}
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<ImportIcon />}
          onClick={() => setImportOpen(true)}
          sx={{
            bgcolor: '#2196f3',
            color: 'white',
            '&:hover': { bgcolor: '#1976d2' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          יבוא CSV
        </Button>
      </Paper>

      {/* Filter bar */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: '#f5f7fa',
          px: 2,
          py: 1,
          mb: 0,
          borderBottom: '1px solid',
          borderColor: 'divider',
          borderRadius: 0,
        }}
      >
        <OrderFilters />
      </Paper>

      {/* Selection action bar */}
      {selectedOrderIds.size > 0 && (
        <Paper
          elevation={0}
          sx={{
            bgcolor: '#e3f2fd',
            px: 2,
            py: 0.75,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            borderBottom: '1px solid',
            borderColor: '#90caf9',
            borderRadius: 0,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1565c0', ml: 1 }}>
            {selectedOrderIds.size} נבחרו
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<CalendarIcon />}
            onClick={() => setBulkDateDialogOpen(true)}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            שנה תאריך אספקה
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<MoveIcon />}
            onClick={handleMoveToPlanning}
            disabled={bulkStatusMutation.isPending || !allSelectedPending}
            title={!allSelectedPending ? 'העברה לתכנון אפשרית רק מסטטוס בהמתנה' : ''}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            העבר לתכנון
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<CancelIcon />}
            onClick={handleCancel}
            disabled={bulkStatusMutation.isPending || hasLockedOrders}
            title={hasLockedOrders ? 'לא ניתן לשנות סטטוס להזמנות שנשלחו לנהג או הושלמו' : ''}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            ביטול
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RevertIcon />}
            onClick={handleRevertToPending}
            disabled={bulkStatusMutation.isPending || !allSelectedInPlanning}
            title={!allSelectedInPlanning ? 'ניתן להחזיר להמתנה רק הזמנות בסטטוס בתכנון' : ''}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            החזר להמתנה
          </Button>
          <Button
            variant="contained"
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!allSelectedDeletable || bulkDeleteMutation.isPending}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            מחיקה
          </Button>
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          שגיאה בטעינת הזמנות
        </Alert>
      )}

      <OrdersTable
        orders={showSuspiciousOnly ? orders.filter((o: any) => o.geocodeValid === false) : orders}
        total={showSuspiciousOnly ? orders.filter((o: any) => o.geocodeValid === false).length : total}
        loading={isLoading}
        onUpdateDeliveryDate={(id, deliveryDate) => {
          deliveryDateMutation.mutate({ id, deliveryDate }, {
            onSuccess: () => setSnackbar({ message: 'תאריך אספקה עודכן', severity: 'success' }),
            onError: () => setSnackbar({ message: 'שגיאה בעדכון תאריך אספקה', severity: 'error' }),
          });
        }}
      />

      <CsvImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        isLoading={bulkDeleteMutation.isPending}
        count={selectedOrderIds.size}
      />

      <Dialog open={bulkDateDialogOpen} onClose={() => setBulkDateDialogOpen(false)}>
        <DialogTitle>שינוי תאריך אספקה ל-{selectedOrderIds.size} הזמנות</DialogTitle>
        <DialogContent>
          <TextField
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
            InputLabelProps={{ shrink: true }}
            label="תאריך אספקה חדש"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDateDialogOpen(false)}>ביטול</Button>
          <Button
            onClick={handleBulkDeliveryDate}
            variant="contained"
            disabled={!bulkDate || bulkDeliveryDateMutation.isPending}
          >
            עדכן
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)}>
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
