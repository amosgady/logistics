import { useState, useEffect, useCallback } from 'react';
import { Alert, Snackbar, Box, Typography, CircularProgress } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SyncIcon from '@mui/icons-material/Sync';
import { getQueueCount, processQueue } from '../services/offlineQueue';
import api from '../services/api';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: number; failed: number } | null>(null);

  const syncQueue = useCallback(async () => {
    const count = getQueueCount();
    if (count === 0) return;

    setIsSyncing(true);
    try {
      const result = await processQueue(async (method, endpoint, data) => {
        if (method === 'POST') await api.post(endpoint, data);
        else if (method === 'PATCH') await api.patch(endpoint, data);
        else if (method === 'PUT') await api.put(endpoint, data);
      });
      setSyncResult(result);
      setTimeout(() => setSyncResult(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 3000);
      // Auto-sync queued actions
      syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBackOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue]);

  return (
    <>
      {/* Persistent offline banner */}
      {!isOnline && (
        <Box
          sx={{
            bgcolor: '#d32f2f',
            color: 'white',
            py: 0.5,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
          }}
        >
          <WifiOffIcon fontSize="small" />
          <Typography variant="body2" fontWeight="bold">
            אין חיבור לאינטרנט - הפעולות יישמרו ויישלחו כשהחיבור יחזור
          </Typography>
        </Box>
      )}

      {/* Syncing indicator */}
      {isSyncing && (
        <Box
          sx={{
            bgcolor: '#1976d2',
            color: 'white',
            py: 0.5,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
          }}
        >
          <CircularProgress size={16} color="inherit" />
          <Typography variant="body2" fontWeight="bold">
            מסנכרן פעולות שנשמרו...
          </Typography>
        </Box>
      )}

      {/* Back online notification */}
      <Snackbar open={showBackOnline} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" icon={<SyncIcon />}>
          החיבור חזר!
        </Alert>
      </Snackbar>

      {/* Sync result */}
      <Snackbar
        open={syncResult !== null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={() => setSyncResult(null)}
      >
        <Alert
          severity={syncResult?.failed ? 'warning' : 'success'}
          variant="filled"
        >
          {syncResult?.success ? `${syncResult.success} פעולות סונכרנו בהצלחה` : ''}
          {syncResult?.failed ? ` | ${syncResult.failed} פעולות נכשלו` : ''}
        </Alert>
      </Snackbar>
    </>
  );
}
