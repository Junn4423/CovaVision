import {requestFaceApi} from '../request';

function recognize(path: string, payload: FormData | Record<string, unknown>) {
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
  return requestFaceApi(path, {
    method: 'POST',
    ...(isFormData ? {} : {headers: {'Content-Type': 'application/json'}}),
    body: isFormData ? payload : JSON.stringify(payload),
  });
}

export const faceRecognitionApi = {
  // A record can only be created from a verified image. Keep this method for
  // old callers, but never send a forgeable employee id to the API.
  checkAttendance: async () => ({
    success: false,
    message: 'Chấm công cần ảnh nhận diện khuôn mặt.',
  }),
  attendanceImage: (formData: FormData) => recognize('/api/v1/attendance/recognize', formData),
  attendanceImageBase64: (data: Record<string, unknown>) => recognize('/api/v1/attendance/recognize', data),
  attendanceDetectFrame: (data: Record<string, unknown>) => recognize('/api/v1/attendance/detect', data),
  attendanceDetectImage: (formData: FormData) => recognize('/api/v1/attendance/detect', formData),
  attendanceSyncStatus: (id: string) => requestFaceApi(`/api/v1/attendance/${encodeURIComponent(id)}`),
};
