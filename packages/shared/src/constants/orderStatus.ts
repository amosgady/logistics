import type { OrderStatus } from '../types';

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['IN_WORK', 'CANCELLED'],
  IN_WORK: ['PLANNING', 'PENDING', 'CANCELLED'],
  PLANNING: ['ASSIGNED_TO_TRUCK', 'IN_COORDINATION', 'APPROVED', 'IN_WORK'],
  ASSIGNED_TO_TRUCK: ['IN_COORDINATION', 'APPROVED', 'PLANNING'],
  IN_COORDINATION: ['APPROVED', 'PLANNING'],
  APPROVED: ['SENT_TO_DRIVER', 'IN_COORDINATION'],
  SENT_TO_DRIVER: ['COMPLETED', 'PLANNING'],
  COMPLETED: [],
  CANCELLED: ['PENDING'],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'בהמתנה',
  IN_WORK: 'בעבודה',
  PLANNING: 'בתכנון',
  ASSIGNED_TO_TRUCK: 'משויך למשאית',
  IN_COORDINATION: 'בתיאום',
  APPROVED: 'מתואם',
  SENT_TO_DRIVER: 'נשלח לנהג',
  COMPLETED: 'הושלם',
  CANCELLED: 'בוטל',
};
