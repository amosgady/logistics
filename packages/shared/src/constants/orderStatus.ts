import type { OrderStatus } from '../types';

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PLANNING', 'CANCELLED'],
  PLANNING: ['ASSIGNED_TO_TRUCK', 'IN_COORDINATION', 'APPROVED', 'PENDING'],
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
  PLANNING: 'בתכנון',
  ASSIGNED_TO_TRUCK: 'משויך למשאית',
  IN_COORDINATION: 'בתיאום',
  APPROVED: 'מתואם',
  SENT_TO_DRIVER: 'נשלח לנהג',
  COMPLETED: 'הושלם',
  CANCELLED: 'בוטל',
};
