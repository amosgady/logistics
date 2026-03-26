import { Chip } from '@mui/material';

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' }> = {
  PENDING: { label: 'בהמתנה', color: 'warning' },
  IN_WORK: { label: 'בעבודה', color: 'info' },
  PLANNING: { label: 'בתכנון', color: 'default' },
  ASSIGNED_TO_TRUCK: { label: 'משויך למשאית', color: 'default' },
  IN_COORDINATION: { label: 'בתיאום', color: 'primary' },
  APPROVED: { label: 'מתואם', color: 'primary' },
  SENT_TO_DRIVER: { label: 'נשלח לנהג', color: 'secondary' },
  COMPLETED: { label: 'הושלם', color: 'success' },
  CANCELLED: { label: 'בוטל', color: 'error' },
};

export default function StatusChip({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'default' as const };
  return <Chip label={config.label} color={config.color} size="small" />;
}
