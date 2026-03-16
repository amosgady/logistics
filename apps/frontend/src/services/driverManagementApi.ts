import api from './api';

export interface DriverRecord {
  id: number;
  userId: number;
  licenseType: string;
  user: {
    id: number;
    username?: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    isActive: boolean;
    department: string | null;
  };
  truckAssignment: Array<{
    id: number;
    isActive: boolean;
    truck: { id: number; name: string; licensePlate: string };
  }>;
}

export const driverManagementApi = {
  getAll: () =>
    api.get('/drivers').then((r) => r.data),

  create: (data: {
    username: string; email?: string; password: string; fullName: string;
    phone?: string; licenseType: string; truckId?: number; department?: string;
  }) =>
    api.post('/drivers', data).then((r) => r.data),

  update: (id: number, data: Record<string, any>) =>
    api.put(`/drivers/${id}`, data).then((r) => r.data),

  deactivate: (id: number) =>
    api.patch(`/drivers/${id}/deactivate`).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/drivers/${id}`).then((r) => r.data),
};
