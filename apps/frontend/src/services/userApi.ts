import api from './api';

export interface UserRecord {
  id: number;
  username: string;
  email: string | null;
  fullName: string;
  role: string;
  department: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export const userApi = {
  getAll: () =>
    api.get('/users').then((r) => r.data),

  create: (data: {
    username: string; email?: string; password: string; fullName: string;
    role: string; department?: string; phone?: string;
  }) =>
    api.post('/users', data).then((r) => r.data),

  update: (id: number, data: Record<string, any>) =>
    api.put(`/users/${id}`, data).then((r) => r.data),

  deactivate: (id: number) =>
    api.patch(`/users/${id}/deactivate`).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/users/${id}`).then((r) => r.data),
};
