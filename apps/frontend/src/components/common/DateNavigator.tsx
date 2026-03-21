import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import {
  ChevronRight as RightIcon,
  ChevronLeft as LeftIcon,
} from '@mui/icons-material';

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DateNavigatorProps {
  date: string;
  onDateChange: (date: string) => void;
  showLabel?: boolean;
  darkMode?: boolean;
}

export default function DateNavigator({ date, onDateChange, showLabel, darkMode }: DateNavigatorProps) {
  const arrows = (
    <>
      <Tooltip title="יום הבא">
        <IconButton
          size="small"
          onClick={() => onDateChange(shiftDate(date, 1))}
          sx={darkMode ? { color: 'white' } : undefined}
        >
          <RightIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="יום קודם">
        <IconButton
          size="small"
          onClick={() => onDateChange(shiftDate(date, -1))}
          sx={darkMode ? { color: 'white' } : undefined}
        >
          <LeftIcon />
        </IconButton>
      </Tooltip>
    </>
  );

  if (showLabel) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          border: '1px solid',
          borderColor: darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.23)',
          borderRadius: 1,
          px: 0.5,
          py: 0,
          position: 'relative',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.65rem',
            color: darkMode ? 'rgba(255,255,255,0.7)' : 'text.secondary',
            lineHeight: 1,
            mt: 0.25,
          }}
        >
          הזז יום
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {arrows}
        </Box>
      </Box>
    );
  }

  return <>{arrows}</>;
}
