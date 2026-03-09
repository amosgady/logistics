import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, CircularProgress,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { trackingApi } from '../../services/trackingApi';

interface Props {
  open: boolean;
  onClose: () => void;
  recipientId: number | undefined;
  recipientName: string | undefined;
  onSuccess: () => void;
}

export default function SendMessageDialog({ open, onClose, recipientId, recipientName, onSuccess }: Props) {
  const [text, setText] = useState('');

  const sendMutation = useMutation({
    mutationFn: () => trackingApi.sendMessage(recipientId!, text),
    onSuccess: () => {
      setText('');
      onSuccess();
      onClose();
    },
  });

  const handleClose = () => {
    setText('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>שליחת הודעה ל-{recipientName}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          multiline
          rows={3}
          fullWidth
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="הקלד הודעה..."
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>ביטול</Button>
        <Button
          variant="contained"
          onClick={() => sendMutation.mutate()}
          disabled={!text.trim() || sendMutation.isPending}
          startIcon={sendMutation.isPending ? <CircularProgress size={16} /> : undefined}
        >
          שלח
        </Button>
      </DialogActions>
    </Dialog>
  );
}
