import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Box,
  Divider,
} from '@mui/material';
import {
  Inventory as OrdersIcon,
  CalendarMonth as PlanningIcon,
  Phone as CoordinationIcon,
  GpsFixed as TrackingIcon,
  LocalShipping as TruckIcon,
  Map as ZonesIcon,
  Settings as SettingsIcon,
  People as PeopleIcon,
  PersonPin as DriverIcon,
  Build as InstallerIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ReactNode } from 'react';

const DRAWER_WIDTH = 200;
const HEADER_COLOR = '#1e3a5f';

interface MenuItem {
  path: string;
  label: string;
  icon: ReactNode;
  roles?: string[]; // if undefined, visible to all
}

const menuItems: MenuItem[] = [
  { path: '/orders', label: 'הזמנות', icon: <OrdersIcon /> },
  { path: '/planning', label: 'תכנון', icon: <PlanningIcon /> },
  { path: '/coordination', label: 'תיאום', icon: <CoordinationIcon /> },
  { path: '/tracking', label: 'מעקב', icon: <TrackingIcon /> },
  { path: '/trucks', label: 'משאיות', icon: <TruckIcon /> },
  { path: '/zones', label: 'אזורים', icon: <ZonesIcon /> },
  { path: '/users', label: 'ניהול משתמשים', icon: <PeopleIcon />, roles: ['ADMIN'] },
  { path: '/drivers', label: 'ניהול נהגים', icon: <DriverIcon />, roles: ['ADMIN'] },
  { path: '/installers', label: 'ניהול מתקינים', icon: <InstallerIcon />, roles: ['ADMIN'] },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role;

  const visibleItems = menuItems.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          bgcolor: '#f8fafc',
          borderLeft: 'none',
          borderRight: `1px solid #e2e8f0`,
        },
      }}
    >
      <Toolbar sx={{ bgcolor: HEADER_COLOR, minHeight: '48px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', justifyContent: 'center' }}>
          <TruckIcon sx={{ color: 'white', fontSize: 20 }} />
          <Typography variant="subtitle1" noWrap sx={{ color: 'white', fontWeight: 700 }}>
            ניהול הובלות
          </Typography>
        </Box>
      </Toolbar>
      <List sx={{ pt: 0.5 }}>
        {visibleItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname.startsWith(item.path)}
              onClick={() => navigate(item.path)}
              sx={{
                py: 0.75,
                '& .MuiListItemIcon-root': {
                  color: HEADER_COLOR,
                  minWidth: 36,
                },
                '& .MuiListItemText-primary': {
                  color: HEADER_COLOR,
                  fontWeight: 500,
                  fontSize: '0.9rem',
                },
                '&.Mui-selected': {
                  bgcolor: 'rgba(30, 58, 95, 0.1)',
                  borderRight: `3px solid ${HEADER_COLOR}`,
                  '& .MuiListItemText-primary': {
                    fontWeight: 700,
                  },
                },
                '&:hover': {
                  bgcolor: 'rgba(30, 58, 95, 0.06)',
                },
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider sx={{ mx: 1 }} />
      <List>
        <ListItem disablePadding>
          <ListItemButton
            selected={location.pathname === '/settings'}
            onClick={() => navigate('/settings')}
            sx={{
              py: 0.75,
              '& .MuiListItemIcon-root': {
                color: HEADER_COLOR,
                minWidth: 36,
              },
              '& .MuiListItemText-primary': {
                color: HEADER_COLOR,
                fontWeight: 500,
                fontSize: '0.9rem',
              },
              '&.Mui-selected': {
                bgcolor: 'rgba(30, 58, 95, 0.1)',
                borderRight: `3px solid ${HEADER_COLOR}`,
                '& .MuiListItemText-primary': {
                  fontWeight: 700,
                },
              },
              '&:hover': {
                bgcolor: 'rgba(30, 58, 95, 0.06)',
              },
            }}
          >
            <ListItemIcon><SettingsIcon /></ListItemIcon>
            <ListItemText primary="הגדרות" />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
}
