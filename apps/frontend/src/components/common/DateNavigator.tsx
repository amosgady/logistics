import { IconButton, Tooltip } from '@mui/material';
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
}

export default function DateNavigator({ date, onDateChange }: DateNavigatorProps) {
  return (
    <>
      <Tooltip title="יום הבא">
        <IconButton size="small" onClick={() => onDateChange(shiftDate(date, 1))}>
          <RightIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="יום קודם">
        <IconButton size="small" onClick={() => onDateChange(shiftDate(date, -1))}>
          <LeftIcon />
        </IconButton>
      </Tooltip>
    </>
  );
}
