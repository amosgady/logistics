import type { OrderStatus } from '../types';

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PLANNING', 'CANCELLED'],
  PLANNING: ['IN_COORDINATION', 'APPROVED', 'PENDING'],
  IN_COORDINATION: ['APPROVED', 'PLANNING', 'PENDING'],
  APPROVED: ['SENT_TO_DRIVER', 'IN_COORDINATION', 'PENDING'],
  SENT_TO_DRIVER: ['COMPLETED', 'PLANNING', 'PENDING'],
  COMPLETED: [],
  CANCELLED: ['PENDING'],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'בהמתנה',
  PLANNING: 'בתכנון',
  IN_COORDINATION: 'בתיאום',
  APPROVED: 'מאושר',
  SENT_TO_DRIVER: 'נשלח לנהג',
  COMPLETED: 'הושלם',
  CANCELLED: 'בוטל',
};
