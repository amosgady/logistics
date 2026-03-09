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

const DRAWER_WIDTH = 240;

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
        },
      }}
    >
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TruckIcon color="primary" />
          <Typography variant="h6" noWrap>
            ניהול הובלות
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List>
        {visibleItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname.startsWith(item.path)}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton
            selected={location.pathname === '/settings'}
            onClick={() => navigate('/settings')}
          >
            <ListItemIcon><SettingsIcon /></ListItemIcon>
            <ListItemText primary="הגדרות" />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
}
