import api from './api';

export interface DepartmentSetting {
  department: string;
  waitTimeMinutes: number;
}

export const settingsApi = {
  getDepartmentSettings: () =>
    api.get('/settings/departments').then((r) => r.data),

  updateDepartmentSettings: (settings: DepartmentSetting[]) =>
    api.put('/settings/departments', { settings }).then((r) => r.data),
};
