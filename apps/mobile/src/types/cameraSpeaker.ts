/** Backend-managed camera speaker preferences. */
export type AudioCodecType = 'aac' | 'pcma' | 'pcmu';

export interface CameraSpeakerProfile {
  id: string;
  name: string;
  brand: string;
  codec: AudioCodecType;
  sampleRate: number;
  bitrate?: number;
  description: string;
}

export const CAMERA_SPEAKER_PROFILES: Record<string, CameraSpeakerProfile> = {
  EZVIZ_H6C: {
    id: 'EZVIZ_H6C', name: 'EZVIZ tương thích', brand: 'EZVIZ', codec: 'aac', sampleRate: 16000, bitrate: 32000,
    description: 'Cấu hình âm thanh do backend quản lý cho camera tương thích.',
  },
  HIKVISION_GENERIC: {
    id: 'HIKVISION_GENERIC', name: 'Hikvision tương thích', brand: 'Hikvision', codec: 'pcma', sampleRate: 8000, bitrate: 64000,
    description: 'Cấu hình âm thanh do backend quản lý cho camera tương thích.',
  },
  ONVIF_STANDARD: {
    id: 'ONVIF_STANDARD', name: 'Camera chuẩn ONVIF', brand: 'ONVIF', codec: 'pcmu', sampleRate: 8000, bitrate: 64000,
    description: 'Cấu hình âm thanh tiêu chuẩn được backend chọn theo camera.',
  },
  CUSTOM: {
    id: 'CUSTOM', name: 'Tùy chỉnh', brand: 'Custom', codec: 'aac', sampleRate: 16000, bitrate: 32000,
    description: 'Tham số tùy chỉnh chỉ được lưu ở backend.',
  },
};

export interface StandaloneAttendanceConfig {
  enabled: boolean;
  volume: number;
  cameraId: string;
  cameraName: string;
  profileId: string;
  cooldownSeconds: number;
}

export const DEFAULT_STANDALONE_CONFIG: StandaloneAttendanceConfig = {
  enabled: false,
  volume: 50,
  cameraId: '',
  cameraName: '',
  profileId: 'ONVIF_STANDARD',
  cooldownSeconds: 30,
};
