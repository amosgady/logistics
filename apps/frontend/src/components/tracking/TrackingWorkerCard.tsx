import { useState } from 'react';
import {
  Card, CardContent, Box, Typography, Chip, IconButton, Tooltip,
  LinearProgress, Collapse, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  MyLocation as LocateIcon,
  Message as MessageIcon,
  LocalShipping as TruckIcon,
  Build as InstallerIcon,
  Photo as PhotoIcon,
  CheckCircle as CompleteIcon,
  Cancel as NotDeliveredIcon,
  RemoveCircle as PartialIcon,
  HourglassEmpty as PendingIcon,
} from '@mui/icons-material';
import DeliveryMediaDialog from '../common/DeliveryMediaDialog';

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

interface OrderLine {
  id: number;
  product: string;
  description: string | null;
  quantity: number;
  weight: string;
}

interface TrackingOrder {
  id: number;
  orderNumber: string;
  status: string;
  customerName: string;
  address: string;
  city: string;
  timeWindow: string | null;
  palletCount: number;
  orderLines: OrderLine[];
  delivery: Delivery | null;
}

interface TrackingWorkerData {
  type: 'DRIVER' | 'INSTALLER';
  userId: number;
  fullName: string;
  phone: string | null;
  truckName: string | null;
  department: string | null;
  routeId: number;
  routeColor: string | null;
  driverName: string | null;
  roundNumber: number;
  lastLocation: { lat: number; lng: number; timestamp: string } | null;
  orders: TrackingOrder[];
  completedCount: number;
  totalCount: number;
}

interface Props {
  worker: TrackingWorkerData;
  isExpanded: boolean;
  onToggle: () => void;
  onLocate: () => void;
  onSendMessage: () => void;
}

function OrderStatusChip({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <Chip icon={<CompleteIcon />} label="הושלם" size="small" color="success" />;
    case 'SENT_TO_DRIVER':
      return <Chip icon={<TruckIcon />} label="בדרך" size="small" color="info" />;
    case 'APPROVED':
      return <Chip icon={<PendingIcon />} label="מתואם" size="small" color="default" />;
    default:
      return <Chip label={status} size="small" />;
  }
}

export default function TrackingWorkerCard({ worker, isExpanded, onToggle, onLocate, onSendMessage }: Props) {
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [mediaDialog, setMediaDialog] = useState<{ order: TrackingOrder } | null>(null);

  const progress = worker.totalCount > 0 ? (worker.completedCount / worker.totalCount) * 100 : 0;

  return (
    <>
      <Card sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {worker.type === 'DRIVER' ? (
              <TruckIcon color="primary" />
            ) : (
              <InstallerIcon sx={{ color: '#f57c00' }} />
            )}
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" fontWeight="bold">
                {worker.fullName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {worker.type === 'DRIVER'
                  ? worker.truckName || 'נהג'
                  : worker.department || 'מתקין'}
                {worker.roundNumber > 1 && ` | סבב ${worker.roundNumber}`}
                {worker.driverName && ` | נהג: ${worker.driverName}`}
              </Typography>
            </Box>
            {worker.routeColor && (
              <Chip label={worker.routeColor} size="small" color="default" sx={{ fontWeight: 'bold' }} />
            )}
            <Chip
              label={worker.type === 'DRIVER' ? 'נהג' : 'מתקין'}
              size="small"
              color={worker.type === 'DRIVER' ? 'primary' : 'warning'}
            />
            <Tooltip title="מצא במפה">
              <span>
                <IconButton size="small" onClick={onLocate} disabled={!worker.lastLocation}>
                  <LocateIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="שלח הודעה">
              <IconButton size="small" onClick={onSendMessage} color="info">
                <MessageIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={onToggle}>
              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          {/* Progress */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
            />
            <Typography variant="caption" fontWeight="bold">
              {worker.completedCount}/{worker.totalCount}
            </Typography>
          </Box>

          {/* Expanded orders */}
          <Collapse in={isExpanded}>
            <Box sx={{ mt: 1.5 }}>
              {worker.orders.map((order) => (
                <Card
                  key={order.id}
                  variant="outlined"
                  sx={{ mb: 1, bgcolor: order.status === 'COMPLETED' ? 'success.50' : 'background.paper' }}
                >
                  <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="body2" fontWeight="bold">
                          {order.orderNumber} – {order.customerName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {order.address}, {order.city}
                          {order.timeWindow && ` | ${order.timeWindow === 'MORNING' ? '8-12' : '12-16'}`}
                          {` | ${order.palletCount} משטחים`}
                        </Typography>
                      </Box>
                      <OrderStatusChip status={order.status} />
                      {order.delivery && (order.delivery.signatureUrl || order.delivery.photos?.length > 0) && (
                        <Tooltip title="מדיה">
                          <IconButton size="small" color="primary" onClick={() => setMediaDialog({ order })}>
                            <PhotoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      >
                        {expandedOrderId === order.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                    </Box>

                    {/* Order lines */}
                    <Collapse in={expandedOrderId === order.id}>
                      <Table size="small" sx={{ mt: 1 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell>מוצר</TableCell>
                            <TableCell align="center">כמות</TableCell>
                            <TableCell align="center">משקל</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {order.orderLines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell>
                                <Typography variant="body2">{line.product}</Typography>
                                {line.description && (
                                  <Typography variant="caption" color="text.secondary">{line.description}</Typography>
                                )}
                              </TableCell>
                              <TableCell align="center">{line.quantity}</TableCell>
                              <TableCell align="center">{line.weight}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Collapse>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      {/* Media dialog */}
      {mediaDialog?.order.delivery && (
        <DeliveryMediaDialog
          open={!!mediaDialog}
          onClose={() => setMediaDialog(null)}
          orderNumber={mediaDialog.order.orderNumber}
          signatureUrl={mediaDialog.order.delivery.signatureUrl}
          photos={mediaDialog.order.delivery.photos || []}
          deliveryResult={mediaDialog.order.delivery.result}
          deliveryNotes={mediaDialog.order.delivery.notes}
          deliveredAt={mediaDialog.order.delivery.deliveredAt}
        />
      )}
    </>
  );
}
