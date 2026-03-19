import api from './api';

export interface DepartmentSetting {
  department: string;
  waitTimeMinutes: number;
}

export interface TruckColor {
  department: string;
  color: string;
}

export const settingsApi = {
  getDepartmentSettings: () =>
    api.get('/settings/departments').then((r) => r.data),

  updateDepartmentSettings: (settings: DepartmentSetting[]) =>
    api.put('/settings/departments', { settings }).then((r) => r.data),

  getTruckColors: () =>
    api.get('/settings/truck-colors').then((r) => r.data),

  updateTruckColors: (colors: TruckColor[]) =>
    api.put('/settings/truck-colors', { colors }).then((r) => r.data),

  getTruckSizes: () =>
    api.get('/settings/truck-sizes').then((r) => r.data),

  updateTruckSizes: (sizes: string[]) =>
    api.put('/settings/truck-sizes', { sizes }).then((r) => r.data),

  getTruckTypes: () =>
    api.get('/settings/truck-types').then((r) => r.data),

  updateTruckTypes: (types: string[]) =>
    api.put('/settings/truck-types', { types }).then((r) => r.data),
};
