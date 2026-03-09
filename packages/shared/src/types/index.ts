export type UserRole = 'ADMIN' | 'COORDINATOR' | 'DRIVER' | 'INSTALLER';

export type OrderStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'IN_COORDINATION'
  | 'APPROVED'
  | 'SENT_TO_DRIVER'
  | 'COMPLETED'
  | 'CANCELLED';

export type TruckSize = 'SMALL' | 'LARGE';
export type TimeWindow = 'MORNING' | 'AFTERNOON';
export type DeliveryResult = 'COMPLETE' | 'PARTIAL' | 'NOT_DELIVERED';
export type CoordinationStatus = 'NOT_STARTED' | 'COORDINATED';
export type ConfirmationMethod = 'LINK' | 'REPLY';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface OrderFilters {
  status?: OrderStatus;
  zoneId?: number;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}
