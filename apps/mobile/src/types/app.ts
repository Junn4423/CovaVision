export interface ConnectionConfig {
  label: string;
  apiBaseUrl: string;
}

export interface ConnectionHealth {
  ok: boolean;
  apiBaseUrl: string;
  checkedAt: string;
  message: string;
  apiStatus: string;
}

export type AppScreen =
  | 'manual_config'
  | 'employee_register'
  | 'admin_login'
  | 'admin_home'
  | 'admin_attendance'
  | 'billing';
