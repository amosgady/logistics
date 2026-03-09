export const DEPARTMENT_LABELS: Record<string, string> = {
  GENERAL_TRANSPORT: 'הובלה כללית',
  KITCHEN_TRANSPORT: 'הובלת מטבחים',
  INTERIOR_DOOR_TRANSPORT: 'הובלת דלתות פנים',
  SHOWER_INSTALLATION: 'התקנת מקלחונים',
  INTERIOR_DOOR_INSTALLATION: 'התקנת דלתות פנים',
  KITCHEN_INSTALLATION: 'התקנת מטבחים',
};

export const DEPARTMENT_OPTIONS = Object.entries(DEPARTMENT_LABELS).map(
  ([value, label]) => ({ value, label })
);

export const INSTALLER_DEPARTMENTS = [
  'SHOWER_INSTALLATION',
  'INTERIOR_DOOR_INSTALLATION',
  'KITCHEN_INSTALLATION',
] as const;

export const INSTALLER_DEPARTMENT_LABELS: Record<string, string> = {
  SHOWER_INSTALLATION: 'מקלחונים',
  INTERIOR_DOOR_INSTALLATION: 'דלתות פנים',
  KITCHEN_INSTALLATION: 'מטבחים',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'מנהל לוגיסטי',
  COORDINATOR: 'מתאם',
  DRIVER: 'נהג',
  INSTALLER: 'מתקין',
};
