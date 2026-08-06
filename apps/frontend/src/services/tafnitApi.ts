import api from './api';

export const tafnitApi = {
  freezeOrder: (orderNumber: string) =>
    api.post('/tafnit/freeze', { orderNumber }).then((r) => r.data),
  getFrozenOrders: () =>
    api.get('/tafnit/frozen-orders').then((r) => r.data),
  getPendingUpdates: () =>
    api.get('/tafnit/pending-updates').then((r) => r.data),
  approvePendingUpdate: (id: number) =>
    api.post(`/tafnit/pending-updates/${id}/approve`).then((r) => r.data),
  rejectPendingUpdate: (id: number) =>
    api.post(`/tafnit/pending-updates/${id}/reject`).then((r) => r.data),
};
