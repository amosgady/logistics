import { AppBar, Toolbar, Typography, Button, Box, Chip } from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'מנהל לוגיסטי',
  COORDINATOR: 'מתאם',
  DRIVER: 'נהג',
  INSTALLER: 'מתקין',
};

// On the DEV/TEST build the top bar turns orange so it's obvious you're not
// on the live system. Enabled via VITE_APP_ENV=dev at build time.
const IS_TEST = import.meta.env.VITE_APP_ENV === 'dev';

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppBar
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, ...(IS_TEST ? { bgcolor: '#ef6c00' } : {}) }}
    >
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          מערכת ניהול הובלות והתקנות{IS_TEST ? ' — טסט' : ''}
        </Typography>
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">{user.fullName}</Typography>
            <Chip
              label={ROLE_LABELS[user.role] || user.role}
              size="small"
              color="secondary"
            />
            <Button
              color="inherit"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              size="small"
            >
              התנתק
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}
