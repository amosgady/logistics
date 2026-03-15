import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import theme from './theme/theme';
import RTLProvider from './theme/RTLProvider';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import OrdersPage from './pages/OrdersPage';
import PlanningPage from './pages/PlanningPage';
import CoordinationPage from './pages/CoordinationPage';
import TrackingPage from './pages/TrackingPage';
import TrucksPage from './pages/TrucksPage';
import ZonesPage from './pages/ZonesPage';
import SettingsPage from './pages/SettingsPage';
import DriverPage from './pages/DriverPage';
import UsersPage from './pages/UsersPage';
import DriversManagementPage from './pages/DriversManagementPage';
import InstallersPage from './pages/InstallersPage';
import InstallerFieldPage from './pages/InstallerFieldPage';
import ConfirmationPage from './pages/ConfirmationPage';
import CheckerPage from './pages/CheckerPage';
import { useAuthStore } from './store/authStore';
import { ReactNode, useEffect } from 'react';
import api from './services/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, setUser, user } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && !user) {
      api.get('/auth/me').then(({ data }) => {
        setUser(data.data);
      }).catch(() => {
        useAuthStore.getState().logout();
      });
    }
  }, [isAuthenticated, user, setUser]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RoleBasedRedirect() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === 'DRIVER') return <Navigate to="/driver" replace />;
  if (user?.role === 'INSTALLER') return <Navigate to="/installer" replace />;
  if (user?.role === 'CHECKER') return <Navigate to="/checker" replace />;
  return <Navigate to="/orders" replace />;
}

export default function App() {
  return (
    <RTLProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* Public confirmation page – no auth */}
              <Route path="/confirm/:token" element={<ConfirmationPage />} />

              {/* Driver route - mobile layout, no sidebar */}
              <Route
                path="/driver"
                element={
                  <ProtectedRoute>
                    <DriverPage />
                  </ProtectedRoute>
                }
              />

              {/* Installer route - mobile layout, no sidebar */}
              <Route
                path="/installer"
                element={
                  <ProtectedRoute>
                    <InstallerFieldPage />
                  </ProtectedRoute>
                }
              />

              {/* Checker route - mobile layout, no sidebar */}
              <Route
                path="/checker"
                element={
                  <ProtectedRoute>
                    <CheckerPage />
                  </ProtectedRoute>
                }
              />

              {/* Coordinator/Admin routes - standard layout with sidebar */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<RoleBasedRedirect />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/planning" element={<PlanningPage />} />
                <Route path="/coordination" element={<CoordinationPage />} />
                <Route path="/tracking" element={<TrackingPage />} />
                <Route path="/trucks" element={<TrucksPage />} />
                <Route path="/zones" element={<ZonesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/drivers" element={<DriversManagementPage />} />
                <Route path="/installers" element={<InstallersPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </RTLProvider>
  );
}
