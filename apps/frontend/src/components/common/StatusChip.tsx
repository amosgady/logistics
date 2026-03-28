import { Chip } from '@mui/material';

const STATUS_CONFIG: Record<string, { label: string; bgcolor: string; color: string }> = {
  PENDING: { label: 'בהמתנה', bgcolor: '#ff9800', color: '#fff' },
  IN_WORK: { label: 'בעבודה', bgcolor: '#1976d2', color: '#fff' },
  PLANNING: { label: 'בתכנון', bgcolor: '#7b1fa2', color: '#fff' },
  ASSIGNED_TO_TRUCK: { label: 'משויך למשאית', bgcolor: '#795548', color: '#fff' },
  IN_COORDINATION: { label: 'בתיאום', bgcolor: '#00acc1', color: '#fff' },
  APPROVED: { label: 'מתואם', bgcolor: '#66bb6a', color: '#fff' },
  SENT_TO_DRIVER: { label: 'נשלח לנהג', bgcolor: '#5c35a4', color: '#fff' },
  COMPLETED: { label: 'הושלם', bgcolor: '#2e7d32', color: '#fff' },
  CANCELLED: { label: 'בוטל', bgcolor: '#d32f2f', color: '#fff' },
};

export default function StatusChip({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, bgcolor: '#9e9e9e', color: '#fff' };
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{ bgcolor: config.bgcolor, color: config.color, fontWeight: 600 }}
    />
  );
}
