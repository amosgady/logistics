import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
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

const DRAWER_WIDTH = 130;
const HEADER_COLOR = '#1e3a5f';

interface MenuItem {
  path: string;
  label: string;
  icon: ReactNode;
  roles?: string[];
}

const mainMenuItems: MenuItem[] = [
  { path: '/orders', label: 'הזמנות', icon: <OrdersIcon /> },
  { path: '/planning', label: 'תכנון', icon: <PlanningIcon /> },
  { path: '/coordination', label: 'תיאום', icon: <CoordinationIcon /> },
  { path: '/tracking', label: 'מעקב', icon: <TrackingIcon /> },
];

const managementMenuItems: MenuItem[] = [
  { path: '/trucks', label: 'משאיות', icon: <TruckIcon /> },
  { path: '/zones', label: 'אזורים', icon: <ZonesIcon /> },
  { path: '/users', label: 'משתמשים', icon: <PeopleIcon />, roles: ['ADMIN'] },
  { path: '/drivers', label: 'נהגים', icon: <DriverIcon />, roles: ['ADMIN'] },
  { path: '/installers', label: 'מתקינים', icon: <InstallerIcon />, roles: ['ADMIN'] },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role;

  const visibleMainItems = mainMenuItems.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );
  const visibleMgmtItems = managementMenuItems.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );

  const buttonSx = {
    py: 0.75,
    px: 1.5,
    '& .MuiListItemIcon-root': {
      color: HEADER_COLOR,
      minWidth: 28,
      '& .MuiSvgIcon-root': { fontSize: 18 },
    },
    '& .MuiListItemText-primary': {
      color: HEADER_COLOR,
      fontWeight: 500,
      fontSize: '0.9rem',
    },
    '&.Mui-selected': {
      bgcolor: 'rgba(30, 58, 95, 0.15)',
      '& .MuiListItemText-primary': {
        fontWeight: 700,
      },
    },
    '&:hover': {
      bgcolor: 'rgba(30, 58, 95, 0.06)',
    },
  };

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
          border: 'none',
        },
      }}
    >
      <Toolbar /> {/* Spacer to align with AppBar */}
      <Box sx={{ height: 28 }} /> {/* Extra spacing to align with page header */}
      <List sx={{ pt: 0 }}>
        {visibleMainItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname.startsWith(item.path)}
              onClick={() => navigate(item.path)}
              sx={buttonSx}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider sx={{ mx: 1, my: 0.5, borderColor: '#c0c8d4' }} />
      <List sx={{ pt: 0 }}>
        {visibleMgmtItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname.startsWith(item.path)}
              onClick={() => navigate(item.path)}
              sx={buttonSx}
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
            sx={buttonSx}
          >
            <ListItemIcon><SettingsIcon /></ListItemIcon>
            <ListItemText primary="הגדרות" />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
}
