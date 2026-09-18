import {api} from './api';

export interface CameraHealthResult {
  isOnline: boolean;
  latencyMs?: number;
  errorTitle?: string;
  errorMessage?: string;
  checkedAt: number;
}

/** Camera health is reported by CovaVision; the app never probes a LAN address. */
export async function checkCameraConnectivity(
  cameraId: string,
  timeoutMs = 2500,
): Promise<CameraHealthResult> {
  const normalizedId = String(cameraId || '').trim();
  const checkedAt = Date.now();
  if (!normalizedId) {
    return {
      isOnline: false,
      errorTitle: 'Chưa chọn camera',
      errorMessage: 'Hãy chọn camera đã cấu hình trên CovaVision.',
      checkedAt,
    };
  }

  const startedAt = Date.now();
  try {
    const response = await Promise.race([
      api.cameraStatus(normalizedId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    const isOnline = response?.success === true
      && response?.camera_id === normalizedId
      && (response?.running === true || response?.has_frame === true);
    return {
      isOnline,
      latencyMs: Date.now() - startedAt,
      errorTitle: isOnline ? undefined : 'Camera chưa chạy',
      errorMessage: isOnline ? undefined : 'Backend chưa nhận được frame từ camera này.',
      checkedAt: Date.now(),
    };
  } catch {
    return {
      isOnline: false,
      latencyMs: Date.now() - startedAt,
      errorTitle: 'Không thể kết nối CovaVision',
      errorMessage: 'Không nhận được trạng thái camera từ backend.',
      checkedAt: Date.now(),
    };
  }
}
