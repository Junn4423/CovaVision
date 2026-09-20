import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueueOfflineAttendance,
  getOfflineAttendanceQueue,
  syncOfflineAttendanceQueue,
} from '../src/services/offlineAttendanceQueue';

describe('offline attendance upload queue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('persists a captured image until the server accepts it', async () => {
    const queued = await enqueueOfflineAttendance({
      image_base64: 'ZmFrZS1pbWFnZQ==',
      camera_id: 'device-camera',
      captured_at: '2026-09-20T10:00:00+07:00',
    });

    expect(queued.id).toBeTruthy();
    expect((await getOfflineAttendanceQueue())).toHaveLength(1);

    const send = jest.fn().mockResolvedValue({
      success: true,
      duplicate: false,
      record: {id: 'server-record-1'},
    });
    const result = await syncOfflineAttendanceQueue(send);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      image_base64: 'ZmFrZS1pbWFnZQ==',
      camera_id: 'device-camera',
    }));
    expect(result.uploaded).toBe(1);
    expect(await getOfflineAttendanceQueue()).toEqual([]);
  });

  test('keeps failed uploads for a later retry and records the error', async () => {
    await enqueueOfflineAttendance({image_base64: 'ZmFpbA=='});
    const send = jest.fn().mockRejectedValue(new Error('network unavailable'));

    const result = await syncOfflineAttendanceQueue(send);
    const pending = await getOfflineAttendanceQueue();

    expect(result.failed).toBe(1);
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].last_error).toBe('network unavailable');
  });
});
