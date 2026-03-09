import api from './api';

export const zoneApi = {
  getAll: () => api.get('/zones').then((r) => r.data),

  create: (data: { name: string; nameHe: string; cities?: string[] }) =>
    api.post('/zones', data).then((r) => r.data),

  update: (id: number, data: { name?: string; nameHe?: string }) =>
    api.put(`/zones/${id}`, data).then((r) => r.data),

  addCities: (zoneId: number, cities: string[]) =>
    api.post(`/zones/${zoneId}/cities`, { cities }).then((r) => r.data),

  removeCity: (zoneId: number, cityId: number) =>
    api.delete(`/zones/${zoneId}/cities/${cityId}`).then((r) => r.data),

  assignZonesToOrders: (orderIds: number[]) =>
    api.post('/zones/assign', { orderIds }).then((r) => r.data),
};
