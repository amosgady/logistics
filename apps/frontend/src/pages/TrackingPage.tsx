import { useState, useMemo } from 'react';
import {
  Box, Typography, TextField, ToggleButtonGroup, ToggleButton,
  Snackbar, Alert, LinearProgress, Paper, Button,
} from '@mui/material';
import { DateRange as DateRangeIcon } from '@mui/icons-material';
import Grid from '@mui/material/Grid2';
import { useQuery } from '@tanstack/react-query';
import { useDateStore } from '../store/dateStore';
import DateNavigator from '../components/common/DateNavigator';

function getNearDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
import { trackingApi } from '../services/trackingApi';
import TrackingMap from '../components/tracking/TrackingMap';
import TrackingWorkerCard from '../components/tracking/TrackingWorkerCard';
import SendMessageDialog from '../components/tracking/SendMessageDialog';

export default function TrackingPage() {
  const { selectedDate: planDate, setSelectedDate: setPlanDate } = useDateStore();
  const [filter, setFilter] = useState<'ALL' | 'DRIVER' | 'INSTALLER'>('ALL');
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ userId: number; name: string } | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tracking-board', planDate],
    queryFn: () => trackingApi.getBoard(planDate),
    refetchInterval: 30000,
  });

  const allWorkers = data?.data || [];

  const workers = useMemo(() => {
    if (filter === 'ALL') return allWorkers;
    return allWorkers.filter((w: any) => w.type === filter);
  }, [allWorkers, filter]);

  return (
    <Box>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: '#1e3a5f',
          color: 'white',
          px: 2,
          py: 1,
          mb: 2,
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'white' }}>
          מעקב שטח
        </Typography>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, v) => v && setFilter(v)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              color: 'rgba(255,255,255,0.7)',
              borderColor: 'rgba(255,255,255,0.3)',
              py: 0.25,
              fontSize: '0.8rem',
              '&.Mui-selected': {
                bgcolor: 'rgba(255,255,255,0.2)',
                color: 'white',
              },
            },
          }}
        >
          <ToggleButton value="ALL">הכל</ToggleButton>
          <ToggleButton value="DRIVER">נהגים</ToggleButton>
          <ToggleButton value="INSTALLER">מתקינים</ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="contained"
          size="small"
          onClick={() => setPlanDate(getNearDate())}
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          יומיים מהיום
        </Button>
        <TextField
          type="date"
          value={planDate}
          onChange={(e) => setPlanDate(e.target.value)}
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'rgba(255,255,255,0.1)',
              color: 'white',
              height: 32,
              '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
              '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
            },
            '& input': { color: 'white', py: 0.5 },
            '& input::-webkit-calendar-picker-indicator': { filter: 'invert(1)' },
          }}
        />
        <DateNavigator date={planDate} onDateChange={setPlanDate} showLabel darkMode />
      </Paper>

      {isLoading ? (
        <LinearProgress />
      ) : workers.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {allWorkers.length === 0
              ? 'אין מסלולים פעילים לתאריך זה'
              : 'אין תוצאות לפילטר הנבחר'}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {/* Workers list */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Box sx={{ maxHeight: 'calc(100vh - 200px)', overflow: 'auto', pr: 0.5 }}>
              {workers.map((worker: any) => (
                <TrackingWorkerCard
                  key={worker.userId}
                  worker={worker}
                  isExpanded={selectedWorkerId === worker.userId}
                  onToggle={() =>
                    setSelectedWorkerId(selectedWorkerId === worker.userId ? null : worker.userId)
                  }
                  onLocate={() => setSelectedWorkerId(worker.userId)}
                  onSendMessage={() =>
                    setMessageTarget({ userId: worker.userId, name: worker.fullName })
                  }
                />
              ))}
            </Box>
          </Grid>

          {/* Map */}
          <Grid size={{ xs: 12, md: 7 }}>
            <TrackingMap
              workers={workers}
              selectedWorkerId={selectedWorkerId}
              onWorkerClick={(id) => setSelectedWorkerId(id)}
              height="calc(100vh - 200px)"
            />
          </Grid>
        </Grid>
      )}

      {/* Send message dialog */}
      <SendMessageDialog
        open={!!messageTarget}
        onClose={() => setMessageTarget(null)}
        recipientId={messageTarget?.userId}
        recipientName={messageTarget?.name}
        onSuccess={() => setSnackbar({ message: 'ההודעה נשלחה בהצלחה', severity: 'success' })}
      />

      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
