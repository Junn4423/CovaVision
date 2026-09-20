import {
  canProbeFaceRecognition,
  markFaceRecognitionResult,
  normalizeFaceDetectionResponse,
  smoothBoundingBox,
} from '../src/utils/faceDetection';

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
    const user = { id: 10, employee_id: 'CV001', name: 'Nhân viên' };
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

describe('face recognition gate and box tracking', () => {
  it('blocks backend recognition when the local frame has no face signal', () => {
    const gate = { pausedUntil: 0, noFaceStreak: 0 };

    expect(canProbeFaceRecognition(gate, false, 1_000)).toBe(false);
    expect(markFaceRecognitionResult(gate, false, 1_000).pausedUntil).toBeGreaterThan(1_000);
  });

  it('backs off repeated no-face responses and resumes after a valid face', () => {
    let gate = { pausedUntil: 0, noFaceStreak: 0 };
    gate = markFaceRecognitionResult(gate, false, 1_000);
    expect(canProbeFaceRecognition(gate, true, 1_001)).toBe(false);
    expect(canProbeFaceRecognition(gate, true, gate.pausedUntil + 1)).toBe(true);
    gate = markFaceRecognitionResult(gate, true, gate.pausedUntil + 1);
    expect(gate).toEqual({pausedUntil: 0, noFaceStreak: 0});
  });

  it('smooths a moving bounding box without freezing the previous position', () => {
    expect(smoothBoundingBox(null, [10, 20, 110, 140])).toEqual([10, 20, 110, 140]);
    expect(smoothBoundingBox([10, 20, 110, 140], [30, 40, 130, 160], 0.75)).toEqual([
      25,
      35,
      125,
      155,
    ]);
  });
});
