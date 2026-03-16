import api from './api';

export interface CheckerOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  deliveryDate: string;
  department: string | null;
  totalLines: number;
  checkedLines: number;
  isFullyChecked: boolean;
}

export interface CheckerOrderLine {
  id: number;
  lineNumber: number;
  product: string;
  description: string | null;
  quantity: number;
  weight: string;
  checkedByInspector: boolean;
  checkedAt: string | null;
}

export interface CheckerOrderDetail {
  id: number;
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  deliveryDate: string;
  department: string | null;
  driverNote: string | null;
  checkerNote: string | null;
  orderLines: CheckerOrderLine[];
}

export const checkerApi = {
  searchOrders: (query?: string, status?: string, date?: string) =>
    api.get('/checker/orders', { params: { q: query, status, date } }).then((r) => r.data.data as CheckerOrder[]),

  getOrderLines: (orderId: number) =>
    api.get(`/checker/orders/${orderId}/lines`).then((r) => r.data.data as CheckerOrderDetail),

  toggleLineCheck: (lineId: number, checked: boolean) =>
    api.patch(`/checker/lines/${lineId}/check`, { checked }).then((r) => r.data.data as { lineId: number; checked: boolean; allLinesChecked: boolean }),

  updateCheckerNote: (orderId: number, checkerNote: string) =>
    api.patch(`/checker/orders/${orderId}/checker-note`, { checkerNote }).then((r) => r.data.data),
};
