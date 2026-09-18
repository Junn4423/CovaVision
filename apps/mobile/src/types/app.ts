export interface ConnectionConfig {
  label: string;
  apiBaseUrl: string;
  webBaseUrl?: string;
  serverId?: string;
  pairVersion?: number;
  pairingMethod?: string;
}

export interface ConnectionHealth {
  ok: boolean;
  apiBaseUrl: string;
  checkedAt: string;
  message: string;
  apiStatus: string;
}

export interface DiscoveredServerOffer {
  serverId: string;
  serverName: string;
  pairVersion: number;
  allowQrPairing: boolean;
  allowUdpDiscovery: boolean;
  apiBaseUrl: string;
  webBaseUrl?: string;
  pairEndpoint: string;
  discoveryPort: number;
  sourceIp: string;
  receivedAt: string;
}

export interface QrPayload {
  schema: string;
  server_id: string;
  pair_version: number;
  pairing_code: string;
  api_base_url: string;
  web_base_url?: string;
}

export interface AutoPairResult {
  connection: ConnectionConfig;
  message: string;
}

export type WebTarget = 'portal' | 'employee' | 'admin';

export type AdminModuleKey =
  | 'dashboard'
  | 'attendance'
  | 'mobile_data'
  | 'camera'
  | 'register'
  | 'sync_verify'
  | 'manage_faces'
  | 'report'
  | 'online_attendance'
  | 'account'
  | 'system_settings';

export type AppScreen =
  | 'auto_config'
  | 'qr_scanner'
  | 'manual_config'
  | 'portal'
  | 'employee_login'
  | 'employee_attendance'
  | 'employee_register'
  | 'admin_login'
  | 'admin_hub'
  | 'admin_attendance'
  | 'admin_workspace';
  