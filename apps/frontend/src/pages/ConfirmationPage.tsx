import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Paper, CircularProgress,
  Alert, Chip, Container, ThemeProvider, CssBaseline,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  ThumbUp as ThumbUpIcon,
  LocalShipping as TruckIcon,
} from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../services/api';
import theme from '../theme/theme';
import RTLProvider from '../theme/RTLProvider';

interface OrderData {
  id: number;
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  deliveryDate: string;
  timeWindow: string | null;
  customerResponse: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  respondedAt: string | null;
}

function formatTimeWindow(tw: string | null): string {
  if (tw === 'MORNING') return '08:00-12:00';
  if (tw === 'AFTERNOON') return '12:00-16:00';
  return '';
}

function ConfirmationContent() {
  const { token } = useParams<{ token: string }>();
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedResponse, setSubmittedResponse] = useState<'CONFIRMED' | 'DECLINED' | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['confirm', token],
    queryFn: () => api.get(`/confirm/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  });

  const order: OrderData | null = data?.data || null;

  const submitMutation = useMutation({
    mutationFn: (response: 'CONFIRMED' | 'DECLINED') =>
      api.post(`/confirm/${token}`, { response, notes: notes || undefined }).then((r) => r.data),
    onSuccess: (_data, response) => {
      setSubmitted(true);
      setSubmittedResponse(response);
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Error state
  if (error || !order) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ fontSize: '1.1rem' }}>
          הקישור אינו תקין או שפג תוקפו
        </Alert>
      </Container>
    );
  }

  // Already responded OR just submitted
  if (submitted || (order.customerResponse !== 'PENDING' && !submitted)) {
    const isConfirmed = submitted
      ? submittedResponse === 'CONFIRMED'
      : order.customerResponse === 'CONFIRMED';

    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          {isConfirmed ? (
            <ThumbUpIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          ) : (
            <CancelIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          )}
          <Typography variant="h5" gutterBottom>
            {submitted ? 'תודה, תגובתך התקבלה!' : 'כבר הגבת לבקשה זו'}
          </Typography>
          <Chip
            label={isConfirmed ? 'אישרת את מועד האספקה' : 'דחית את מועד האספקה'}
            color={isConfirmed ? 'success' : 'error'}
            sx={{ fontSize: '1rem', py: 2, px: 1 }}
          />
        </Paper>
      </Container>
    );
  }

  // Confirmation form
  const deliveryDateFormatted = new Date(order.deliveryDate).toLocaleDateString('he-IL');
  const timeWindowFormatted = formatTimeWindow(order.timeWindow);
  const fullAddress = `${order.address}, ${order.city}`;

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Paper sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <TruckIcon color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h6" color="primary">אישור מועד אספקה</Typography>
        </Box>

        {/* Order details */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          "{order.customerName}" שלום,
        </Typography>
        <Typography variant="body1" sx={{ mb: 1, fontSize: '1.1rem', lineHeight: 1.8 }}>
          הזמנה מספר <strong>{order.orderNumber}</strong> תסופק לך
          ב-<strong>{deliveryDateFormatted}</strong>
          {timeWindowFormatted && (
            <> בין השעות <strong>{timeWindowFormatted}</strong></>
          )}
          {' '}ל-<strong>{fullAddress}</strong>
        </Typography>

        {/* Notes field */}
        <TextField
          label="הערה (אופציונלי)"
          multiline
          rows={3}
          fullWidth
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערה, בקשה מיוחדת..."
          sx={{ mt: 3, mb: 3 }}
        />

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button
            variant="contained"
            color="success"
            size="large"
            startIcon={submitMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
            onClick={() => submitMutation.mutate('CONFIRMED')}
            disabled={submitMutation.isPending}
            sx={{ flex: 1, py: 1.5, fontSize: '1.1rem' }}
          >
            אני מאשר
          </Button>
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={submitMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <CancelIcon />}
            onClick={() => submitMutation.mutate('DECLINED')}
            disabled={submitMutation.isPending}
            sx={{ flex: 1, py: 1.5, fontSize: '1.1rem' }}
          >
            לא מאשר
          </Button>
        </Box>

        {submitMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            אירעה שגיאה, נסה שוב
          </Alert>
        )}
      </Paper>
    </Container>
  );
}

/**
 * Public confirmation page – wrapped with theme providers
 * but no auth / no AppLayout / no sidebar.
 */
export default function ConfirmationPage() {
  return (
    <RTLProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ConfirmationContent />
      </ThemeProvider>
    </RTLProvider>
  );
}
