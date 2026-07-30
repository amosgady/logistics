import api from './api';

export const tafnitApi = {
  freezeOrder: (orderNumber: string) =>
    api.post('/tafnit/freeze', { orderNumber }).then((r) => r.data),
  getFrozenOrders: () =>
    api.get('/tafnit/frozen-orders').then((r) => r.data),
};
