import api from './api';

export interface InstallerRecord {
  id: number;
  userId: number;
  startTime: string;
  endTime: string;
  department: string | null;
  finalAddress: string | null;
  user: {
    id: number;
    fullName: string;
    phone: string | null;
    email: string;
    isActive: boolean;
  };
  zone: { id: number; name: string; nameHe: string } | null;
}

export const installerApi = {
  getAll: () =>
    api.get('/installers').then((r) => r.data),

  create: (data: {
    email: string; password: string; fullName: string; phone?: string;
    department: string; zoneId?: number; startTime: string; endTime: string;
    finalAddress?: string;
  }) =>
    api.post('/installers', data).then((r) => r.data),

  update: (id: number, data: Record<string, any>) =>
    api.put(`/installers/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/installers/${id}`).then((r) => r.data),
};
