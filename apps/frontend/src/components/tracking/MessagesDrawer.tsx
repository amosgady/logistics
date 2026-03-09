import {
  Drawer, Box, Typography, List, ListItem, ListItemText,
  IconButton, Divider, Chip,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trackingApi } from '../../services/trackingApi';

interface Message {
  id: number;
  text: string;
  isRead: boolean;
  createdAt: string;
  sender: { fullName: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${time}`;
}

export default function MessagesDrawer({ open, onClose }: Props) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['my-messages'],
    queryFn: () => trackingApi.getMyMessages(),
    refetchInterval: 30000,
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (messageId: number) => trackingApi.markMessageRead(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-messages'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const messages: Message[] = data?.data || [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 340 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2 }}>
        <Typography variant="h6">הודעות</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      {messages.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">אין הודעות</Typography>
        </Box>
      ) : (
        <List sx={{ p: 0 }}>
          {messages.map((msg) => (
            <ListItem
              key={msg.id}
              sx={{
                bgcolor: msg.isRead ? 'transparent' : 'action.hover',
                cursor: !msg.isRead ? 'pointer' : 'default',
                borderBottom: '1px solid',
                borderColor: 'divider',
                alignItems: 'flex-start',
              }}
              onClick={() => {
                if (!msg.isRead) markReadMutation.mutate(msg.id);
              }}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2">{msg.sender.fullName}</Typography>
                    {!msg.isRead && <Chip label="חדש" size="small" color="error" sx={{ height: 20 }} />}
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
                      {formatTime(msg.createdAt)}
                    </Typography>
                  </Box>
                }
                secondary={msg.text}
                secondaryTypographyProps={{ sx: { whiteSpace: 'pre-wrap', mt: 0.5 } }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Drawer>
  );
}
