import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
} from '@mui/material';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  count: number;
}

export default function DeleteConfirmDialog({ open, onClose, onConfirm, isLoading, count }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>אישור מחיקה</DialogTitle>
      <DialogContent>
        <Typography>
          {count === 1
            ? 'האם למחוק את ההזמנה הנבחרת? פעולה זו אינה ניתנת לביטול.'
            : `האם למחוק ${count} הזמנות נבחרות? פעולה זו אינה ניתנת לביטול.`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          ביטול
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? <CircularProgress size={20} /> : 'מחיקה'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
