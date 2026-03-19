import api from './api';

export const planningApi = {
  getBoard: (date: string) =>
    api.get('/planning/board', { params: { date } }).then((r) => r.data),

  assignOrderToTruck: (orderId: number, truckId: number, routeDate: string) =>
    api.post('/planning/assign-truck', { orderId, truckId, routeDate }).then((r) => r.data),

  assignOrderToInstaller: (orderId: number, installerProfileId: number, routeDate: string) =>
    api.post('/planning/assign-installer', { orderId, installerProfileId, routeDate }).then((r) => r.data),

  removeOrderFromTruck: (orderId: number) =>
    api.delete(`/planning/orders/${orderId}/unassign`).then((r) => r.data),

  reorderRoute: (routeId: number, orderIds: number[]) =>
    api.patch(`/planning/routes/${routeId}/reorder`, { orderIds }).then((r) => r.data),

  assignTimeWindows: (routeId: number) =>
    api.post(`/planning/routes/${routeId}/time-windows`).then((r) => r.data),

  optimizeRoute: (routeId: number) =>
    api.post(`/planning/routes/${routeId}/optimize`).then((r) => r.data),

  approveOvertime: (routeId: number) =>
    api.post(`/planning/routes/${routeId}/approve-overtime`).then((r) => r.data),

  geocodeOrders: (orderIds: number[]) =>
    api.post('/planning/geocode', { orderIds }).then((r) => r.data),

  sendToCoordination: (routeId: number) =>
    api.post(`/planning/routes/${routeId}/send-to-coordination`).then((r) => r.data),

  geoSort: (orderIds: number[]) =>
    api.post('/planning/geo-sort', { orderIds }).then((r) => r.data),

  setRouteColor: (routeId: number, color: string | null) =>
    api.patch(`/planning/routes/${routeId}/color`, { color }).then((r) => r.data),

  addRound: (routeId: number) =>
    api.post(`/planning/routes/${routeId}/add-round`).then((r) => r.data),
};
