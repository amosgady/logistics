import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Upload as ImportIcon,
  MoveDown as MoveIcon,
  Cancel as CancelIcon,
  Undo as RevertIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import OrdersTable from '../components/orders/OrdersTable';
import OrderFilters from '../components/orders/OrderFilters';
import CsvImportDialog from '../components/orders/CsvImportDialog';
import DeleteConfirmDialog from '../components/orders/DeleteConfirmDialog';
import { useOrders, useBulkChangeStatus, useBulkDelete, useUpdateDeliveryDate } from '../hooks/useOrders';
import { useOrderStore } from '../store/orderStore';

export default function OrdersPage() {
  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const { data, isLoading, error } = useOrders();
  const bulkStatusMutation = useBulkChangeStatus();
  const bulkDeleteMutation = useBulkDelete();
  const deliveryDateMutation = useUpdateDeliveryDate();
  const selectedOrderIds = useOrderStore((s) => s.selectedOrderIds);

  const orders = data?.data || [];
  const total = data?.meta?.total || 0;

  const allSelectedDeletable = selectedOrderIds.size > 0 &&
    Array.from(selectedOrderIds).every((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'PENDING' || order?.status === 'CANCELLED';
    });

  const hasLockedOrders = selectedOrderIds.size > 0 &&
    Array.from(selectedOrderIds).some((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'SENT_TO_DRIVER' || order?.status === 'COMPLETED';
    });

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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">הזמנות</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {selectedOrderIds.size > 0 && (
            <>
              <Button
                variant="contained"
                startIcon={<MoveIcon />}
                onClick={handleMoveToPlanning}
                disabled={bulkStatusMutation.isPending || hasLockedOrders}
                title={hasLockedOrders ? 'לא ניתן לשנות סטטוס להזמנות שנשלחו לנהג או הושלמו' : ''}
              >
                העבר לתכנון ({selectedOrderIds.size})
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                onClick={handleCancel}
                disabled={bulkStatusMutation.isPending || hasLockedOrders}
                title={hasLockedOrders ? 'לא ניתן לשנות סטטוס להזמנות שנשלחו לנהג או הושלמו' : ''}
              >
                ביטול ({selectedOrderIds.size})
              </Button>
              <Button
                variant="outlined"
                startIcon={<RevertIcon />}
                onClick={handleRevertToPending}
                disabled={bulkStatusMutation.isPending || hasLockedOrders}
                title={hasLockedOrders ? 'לא ניתן לשנות סטטוס להזמנות שנשלחו לנהג או הושלמו' : ''}
              >
                החזר להמתנה ({selectedOrderIds.size})
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
                disabled={!allSelectedDeletable || bulkDeleteMutation.isPending}
              >
                מחיקה ({selectedOrderIds.size})
              </Button>
            </>
          )}
          <Button
            variant="contained"
            startIcon={<ImportIcon />}
            onClick={() => setImportOpen(true)}
          >
            יבוא CSV
          </Button>
        </Box>
      </Box>

      <OrderFilters />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          שגיאה בטעינת הזמנות
        </Alert>
      )}

      <OrdersTable
        orders={orders}
        total={total}
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
