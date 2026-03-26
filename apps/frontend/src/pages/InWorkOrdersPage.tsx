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
  MoveDown as MoveIcon,
  Cancel as CancelIcon,
  Undo as RevertIcon,
  CalendarMonth as CalendarIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import OrdersTable from '../components/orders/OrdersTable';
import OrderFilters from '../components/orders/OrderFilters';
import { useInWorkOrders, useBulkChangeStatusInWork, useBulkUpdateDeliveryDateInWork } from '../hooks/useInWorkOrders';
import { useInWorkOrderStore } from '../store/inWorkOrderStore';
import { useUpdateDeliveryDate } from '../hooks/useOrders';

export default function InWorkOrdersPage() {
  const [bulkDateDialogOpen, setBulkDateDialogOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'warning' } | null>(null);
  const { data, isLoading, error } = useInWorkOrders();
  const bulkStatusMutation = useBulkChangeStatusInWork();
  const bulkDeliveryDateMutation = useBulkUpdateDeliveryDateInWork();
  const deliveryDateMutation = useUpdateDeliveryDate();
  const selectedOrderIds = useInWorkOrderStore((s) => s.selectedOrderIds);

  const orders = data?.data || [];
  const total = data?.meta?.total || 0;

  const hasCrossPageSelection = selectedOrderIds.size > 0 &&
    Array.from(selectedOrderIds).some((id) => !orders.find((o: any) => o.id === id));

  const allSelectedInWork = selectedOrderIds.size > 0 && (hasCrossPageSelection ||
    Array.from(selectedOrderIds).every((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'IN_WORK';
    }));

  const allSelectedInPlanning = selectedOrderIds.size > 0 && (hasCrossPageSelection ||
    Array.from(selectedOrderIds).every((id) => {
      const order = orders.find((o: any) => o.id === id);
      return order?.status === 'PLANNING';
    }));

  const hasLockedOrders = !hasCrossPageSelection && selectedOrderIds.size > 0 &&
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

  const handlePrintLabels = () => {
    const selectedOrders = orders.filter((o: any) => selectedOrderIds.has(o.id));
    if (selectedOrders.length === 0) return;

    const labels: { customerName: string; address: string; phone: string; orderNumber: string; labelIndex: number; totalLabels: number }[] = [];

    for (const order of selectedOrders) {
      const totalItems = (order.palletCount || 0) + (order.faucetCount || 0) + (order.bathtubCount || 0) +
        (order.panelCount || 0) + (order.showerCount || 0) + (order.rodCount || 0) + (order.cabinetCount || 0);
      const count = Math.max(totalItems, 1);
      for (let i = 1; i <= count; i++) {
        labels.push({
          customerName: order.customerName || '',
          address: `${order.address || ''}, ${order.city || ''}`,
          phone: order.phone || '',
          orderNumber: order.orderNumber || '',
          labelIndex: i,
          totalLabels: count,
        });
      }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>הדפסת מדבקות</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
        <style>
          @page { size: 100mm 100mm; margin: 0; }
          body { margin: 0; font-family: Arial, sans-serif; }
          .label {
            width: 100mm; height: 100mm; box-sizing: border-box;
            padding: 6mm; display: flex; flex-direction: column;
            justify-content: center; align-items: center; text-align: center;
            page-break-after: always;
          }
          .label:last-child { page-break-after: avoid; }
          .customer { font-size: 18pt; font-weight: bold; margin-bottom: 3mm; }
          .address { font-size: 14pt; margin-bottom: 2mm; }
          .phone { font-size: 14pt; margin-bottom: 2mm; }
          .order { font-size: 12pt; margin-bottom: 2mm; color: #555; }
          .barcode { margin: 2mm 0; }
          .barcode svg { height: 15mm; }
          .pallet { font-size: 20pt; font-weight: bold; margin-top: 2mm; color: #000; }
          @media print { .label { border: none; } }
        </style>
      </head>
      <body>
        ${labels.map((l, idx) => `
          <div class="label">
            <div class="customer">${l.customerName}</div>
            <div class="address">${l.address}</div>
            <div class="phone">טל: ${l.phone}</div>
            <div class="order">הזמנה: ${l.orderNumber}</div>
            <div class="barcode"><svg class="bc-${idx}"></svg></div>
            <div class="pallet">משטח ${l.labelIndex}/${l.totalLabels}</div>
          </div>
        `).join('')}
        <script>
          ${labels.map((l, idx) => `JsBarcode('.bc-${idx}', '${l.orderNumber}-${l.labelIndex}', { format: 'CODE128', width: 2, height: 40, displayValue: true, fontSize: 12 });`).join('\n')}
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const useStore = useInWorkOrderStore as any;

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
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'white', ml: 1 }}>
          הזמנות בעבודה
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', ml: 1 }}>
          ({total})
        </Typography>
      </Paper>

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
        <OrderFilters useStore={useStore} />
      </Paper>

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
            disabled={bulkStatusMutation.isPending || !allSelectedInWork}
            title={!allSelectedInWork ? 'העברה לתכנון אפשרית רק מסטטוס בעבודה' : ''}
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
            disabled={bulkStatusMutation.isPending || !allSelectedInWork}
            title={!allSelectedInWork ? 'ניתן להחזיר להמתנה רק הזמנות בסטטוס בעבודה' : ''}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            החזר להמתנה
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrintLabels}
            disabled={selectedOrderIds.size === 0}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            הדפסת מדבקות
          </Button>
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          שגיאה בטעינת הזמנות
        </Alert>
      )}

      <OrdersTable
        orders={orders}
        total={total}
        loading={isLoading}
        useStore={useStore}
        onUpdateDeliveryDate={(id, deliveryDate) => {
          deliveryDateMutation.mutate({ id, deliveryDate }, {
            onSuccess: () => setSnackbar({ message: 'תאריך אספקה עודכן', severity: 'success' }),
            onError: () => setSnackbar({ message: 'שגיאה בעדכון תאריך אספקה', severity: 'error' }),
          });
        }}
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
