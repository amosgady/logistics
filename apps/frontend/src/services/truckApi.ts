import api from './api';

export const truckApi = {
  getAll: () => api.get('/trucks').then((r) => r.data),

  getById: (id: number) => api.get(`/trucks/${id}`).then((r) => r.data),

  create: (data: {
    name: string;
    licensePlate: string;
    size: string;
    hasCrane?: boolean;
    maxWeightKg: number;
    maxPallets: number;
    startTime: string;
    endTime: string;
    waitTimePerStop: number;
  }) => api.post('/trucks', data).then((r) => r.data),

  update: (id: number, data: Record<string, any>) =>
    api.put(`/trucks/${id}`, data).then((r) => r.data),

  delete: (id: number) => api.delete(`/trucks/${id}`).then((r) => r.data),

  getLoad: (id: number, routeDate: string) =>
    api.get(`/trucks/${id}/load`, { params: { routeDate } }).then((r) => r.data),
};
