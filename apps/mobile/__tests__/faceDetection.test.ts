import { normalizeFaceDetectionResponse } from '../src/utils/faceDetection';

describe('normalizeFaceDetectionResponse', () => {
  it('promotes a matched admin detection to detected_user', () => {
    const result = normalizeFaceDetectionResponse({
      success: true,
      detected_count: 1,
      matched: true,
      detections: [
        {
          matched: true,
          user_id: 34,
          name: 'Nguyễn Văn A',
          bbox: [1, 2, 3, 4],
          similarity_percent: 58.07,
        },
      ],
    });

    expect(result.detected).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.detected_user).toMatchObject({
      id: 34,
      user_id: 34,
      name: 'Nguyễn Văn A',
    });
    expect(result.detection_bbox).toEqual([1, 2, 3, 4]);
  });

  it('keeps the employee response user and does not invent a match', () => {
    const user = { id: 10, employee_id: 'SOF010', name: 'Nhân viên' };
    const result = normalizeFaceDetectionResponse({
      success: true,
      detected: true,
      matched: false,
      detected_user: user,
      detections: [{ matched: false }],
    });

    expect(result.matched).toBe(false);
    expect(result.detected_user).toEqual(user);
  });
});
