import AsyncStorage from '@react-native-async-storage/async-storage';
import {api} from './api';

const OFFLINE_ATTENDANCE_QUEUE_KEY = 'covavision.mobile.attendance_outbox.v1';

export type OfflineAttendanceInput = {
  image_base64: string;
  camera_id?: string;
  captured_at?: string;
  location?: unknown;
};

export type OfflineAttendanceItem = OfflineAttendanceInput & {
  id: string;
  client_event_id: string;
  created_at: string;
  attempts: number;
  last_error?: string;
};

export type OfflineAttendanceSyncResult = {
  uploaded: number;
  failed: number;
  remaining: number;
};

type Sender = (payload: Record<string, unknown>) => Promise<any>;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function makeId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue(): Promise<OfflineAttendanceItem[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_ATTENDANCE_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(item => normalizeText(item?.image_base64)) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: OfflineAttendanceItem[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_ATTENDANCE_QUEUE_KEY, JSON.stringify(items));
}

export async function getOfflineAttendanceQueue(): Promise<OfflineAttendanceItem[]> {
  return readQueue();
}

export async function enqueueOfflineAttendance(
  input: OfflineAttendanceInput,
): Promise<OfflineAttendanceItem> {
  const imageBase64 = normalizeText(input.image_base64);
  if (!imageBase64) {
    throw new Error('Ảnh chấm công offline không hợp lệ.');
  }

  const id = makeId();
  const item: OfflineAttendanceItem = {
    id,
    client_event_id: id,
    image_base64: imageBase64,
    camera_id: normalizeText(input.camera_id) || undefined,
    captured_at: normalizeText(input.captured_at) || new Date().toISOString(),
    location: input.location,
    created_at: new Date().toISOString(),
    attempts: 0,
  };
  const queue = await readQueue();
  await writeQueue([...queue, item]);
  return item;
}

export async function clearOfflineAttendanceQueue(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_ATTENDANCE_QUEUE_KEY);
}

export async function syncOfflineAttendanceQueue(
  sender: Sender = payload => api.attendanceImageBase64(payload),
): Promise<OfflineAttendanceSyncResult> {
  const queue = await readQueue();
  if (queue.length === 0) return {uploaded: 0, failed: 0, remaining: 0};

  const remaining: OfflineAttendanceItem[] = [];
  let uploaded = 0;
  let failed = 0;
  for (const item of queue) {
    try {
      const response = await sender({
        image_base64: item.image_base64,
        camera_id: item.camera_id,
        captured_at: item.captured_at,
        location: item.location,
        client_event_id: item.client_event_id,
        include_preview: false,
      });
      if (response?.success === true) {
        uploaded += 1;
        continue;
      }
      failed += 1;
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        last_error: normalizeText(response?.message || response?.detail) || 'Server chưa ghi nhận ảnh offline.',
      });
    } catch (error: any) {
      failed += 1;
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        last_error: normalizeText(error?.message) || 'Không kết nối được máy chủ.',
      });
    }
  }
  await writeQueue(remaining);
  return {uploaded, failed, remaining: remaining.length};
}
