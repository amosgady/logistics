import api from './api';

export const orderApi = {
  getOrders: (params: Record<string, any>) => {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        if (v.length > 0) cleaned[k] = v.join(',');
      } else {
        cleaned[k] = v;
      }
    }
    return api.get('/orders', { params: cleaned }).then((r) => r.data);
  },

  getOrderById: (id: number) =>
    api.get(`/orders/${id}`).then((r) => r.data),

  importCsv: (file: File, decisions?: any) => {
    const formData = new FormData();
    formData.append('file', file);
    if (decisions) {
      formData.append('decisions', JSON.stringify(decisions));
    }
    return api.post('/orders/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  analyzeCsvImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/orders/import/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  changeStatus: (id: number, status: string, reason?: string) =>
    api.patch(`/orders/${id}/status`, { status, reason }).then((r) => r.data),

  bulkChangeStatus: (orderIds: number[], targetStatus: string) =>
    api.post('/orders/bulk-status', { orderIds, targetStatus }).then((r) => r.data),

  updateDeliveryDate: (id: number, deliveryDate: string) =>
    api.patch(`/orders/${id}/delivery-date`, { deliveryDate }).then((r) => r.data),

  updateZone: (id: number, zoneId: number) =>
    api.patch(`/orders/${id}/zone`, { zoneId }).then((r) => r.data),

  updateCoordination: (id: number, data: { coordinationStatus: string; coordinationNotes?: string }) =>
    api.patch(`/orders/${id}/coordination`, data).then((r) => r.data),

  deleteOrder: (id: number) =>
    api.delete(`/orders/${id}`).then((r) => r.data),

  bulkDelete: (orderIds: number[]) =>
    api.post('/orders/bulk-delete', { orderIds }).then((r) => r.data),

  updatePalletCount: (orderId: number, palletCount: number) =>
    api.patch(`/orders/${orderId}/pallet-count`, { palletCount }).then((r) => r.data),
};
