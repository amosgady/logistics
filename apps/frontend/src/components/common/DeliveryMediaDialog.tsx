import {
  Dialog, DialogTitle, DialogContent, Box, Typography,
  IconButton, Chip, Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  Draw as SignatureIcon,
  Photo as PhotoIcon,
  CheckCircle as CompleteIcon,
  RemoveCircle as PartialIcon,
  Cancel as NotDeliveredIcon,
  Schedule as TimeIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';

interface DeliveryPhoto {
  id: number;
  photoUrl: string;
}

const DELIVERY_RESULT_MAP: Record<string, { label: string; color: 'success' | 'warning' | 'error'; icon: React.ReactNode }> = {
  COMPLETE: { label: 'הושלם', color: 'success', icon: <CompleteIcon fontSize="small" /> },
  PARTIAL: { label: 'חלקי', color: 'warning', icon: <PartialIcon fontSize="small" /> },
  NOT_DELIVERED: { label: 'לא סופק', color: 'error', icon: <NotDeliveredIcon fontSize="small" /> },
};

interface DeliveryMediaDialogProps {
  open: boolean;
  onClose: () => void;
  orderNumber: string;
  signatureUrl: string | null;
  photos: DeliveryPhoto[];
  deliveryResult?: string | null;
  deliveryNotes?: string | null;
  deliveredAt?: string | null;
}

export default function DeliveryMediaDialog({
  open,
  onClose,
  orderNumber,
  signatureUrl,
  photos,
  deliveryResult,
  deliveryNotes,
  deliveredAt,
}: DeliveryMediaDialogProps) {
  const resultInfo = deliveryResult ? DELIVERY_RESULT_MAP[deliveryResult] : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        מסמכי אספקה - {orderNumber}
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {/* Delivery info chips */}
        {(resultInfo || deliveredAt) && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {resultInfo && (
              <Chip
                icon={resultInfo.icon as React.ReactElement}
                label={resultInfo.label}
                color={resultInfo.color}
                size="small"
              />
            )}
            {deliveredAt && (
              <Chip
                icon={<TimeIcon />}
                label={new Date(deliveredAt).toLocaleString('he-IL', {
                  day: 'numeric',
                  month: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        )}

        {/* Notes */}
        {deliveryNotes && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <NotesIcon fontSize="small" /> הערות נהג
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ bgcolor: '#f5f5f5', p: 1, borderRadius: 1 }}>
              {deliveryNotes}
            </Typography>
          </Box>
        )}

        {(deliveryNotes || resultInfo || deliveredAt) && (signatureUrl || photos.length > 0) && (
          <Divider sx={{ mb: 2 }} />
        )}

        {/* Signature */}
        {signatureUrl && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SignatureIcon fontSize="small" /> חתימת לקוח
            </Typography>
            <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 1, bgcolor: '#fff', textAlign: 'center' }}>
              <img
                src={signatureUrl}
                alt="חתימה"
                style={{ maxWidth: '100%', maxHeight: 200 }}
              />
            </Box>
          </Box>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PhotoIcon fontSize="small" /> תמונות ({photos.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {photos.map((photo) => (
                <Box
                  key={photo.id}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => window.open(photo.photoUrl, '_blank')}
                >
                  <img
                    src={photo.photoUrl}
                    alt=""
                    style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Empty state */}
        {!signatureUrl && photos.length === 0 && (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
            אין חתימה או תמונות לדיווח זה
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
