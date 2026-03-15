import { Box, Toolbar } from '@mui/material';
import { Outlet, Navigate } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../store/authStore';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);

  // Redirect field roles away from desktop layout
  if (user?.role === 'CHECKER') return <Navigate to="/checker" replace />;
  if (user?.role === 'DRIVER') return <Navigate to="/driver" replace />;
  if (user?.role === 'INSTALLER') return <Navigate to="/installer" replace />;

  return (
    <Box sx={{ display: 'flex' }}>
      <Header />
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar /> {/* Spacer for fixed AppBar */}
        <Outlet />
      </Box>
    </Box>
  );
}
