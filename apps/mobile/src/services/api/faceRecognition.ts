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
  checkAttendance: (employeeId: string, location: unknown = null, attendanceType = 'auto', options: Record<string, unknown> | null = null) =>
    recognize('/api/v1/attendance', {employee_id: employeeId, location, attendance_type: attendanceType, ...(options || {})}),
  attendanceImage: (formData: FormData) => recognize('/api/v1/attendance/recognize', formData),
  attendanceImageBase64: (data: Record<string, unknown>) => recognize('/api/v1/attendance/recognize', data),
  attendanceDetectFrame: (data: Record<string, unknown>) => recognize('/api/v1/attendance/detect', data),
  attendanceDetectImage: (formData: FormData) => recognize('/api/v1/attendance/detect', formData),
  attendanceSyncStatus: (id: string) => requestFaceApi(`/api/v1/attendance/${encodeURIComponent(id)}`),
};
