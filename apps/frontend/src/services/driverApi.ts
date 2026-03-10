import api from './api';

export const driverApi = {
  getMyRoute: (date?: string) =>
    api.get('/driver/my-route', { params: date ? { date } : {} }).then((r) => r.data),

  recordDelivery: (orderId: number, data: { result: string; notes?: string }) =>
    api.post(`/driver/orders/${orderId}/delivery`, data).then((r) => r.data),

  uploadSignature: (orderId: number, signature: string) =>
    api.post(`/driver/orders/${orderId}/signature`, { signature }).then((r) => r.data),

  uploadPhotos: (orderId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('photos', f));
    return api.post(`/driver/orders/${orderId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  signDeliveryNote: (orderId: number, signature: string) =>
    api.post(`/driver/orders/${orderId}/sign-delivery-note`, { signature }).then((r) => r.data),
};
