export type FaceRecognitionGate = {
  pausedUntil: number;
  noFaceStreak: number;
};

export function canProbeFaceRecognition(
  gate: FaceRecognitionGate,
  localFaceSignal: boolean,
  now = Date.now(),
): boolean {
  return Boolean(localFaceSignal) && now >= Number(gate?.pausedUntil || 0);
}

export function markFaceRecognitionResult(
  gate: FaceRecognitionGate,
  detected: boolean,
  now = Date.now(),
): FaceRecognitionGate {
  if (detected) {
    return {pausedUntil: 0, noFaceStreak: 0};
  }
  const noFaceStreak = Math.min(8, Math.max(0, Number(gate?.noFaceStreak || 0)) + 1);
  const pauseMs = Math.min(3_000, 700 + noFaceStreak * 250);
  return {pausedUntil: now + pauseMs, noFaceStreak};
}

export function smoothBoundingBox(
  previous: number[] | null | undefined,
  next: number[] | null | undefined,
  alpha = 0.75,
): number[] | null {
  if (!Array.isArray(next) || next.length < 4) {
    return Array.isArray(previous) && previous.length >= 4 ? previous.slice(0, 4) : null;
  }
  const current = next.slice(0, 4).map(Number);
  if (current.some(value => !Number.isFinite(value))) {
    return Array.isArray(previous) && previous.length >= 4 ? previous.slice(0, 4) : null;
  }
  if (!Array.isArray(previous) || previous.length < 4) {
    return current;
  }
  const weight = Math.max(0.35, Math.min(1, Number(alpha) || 0.75));
  return current.map((value, index) => {
    const oldValue = Number(previous[index]);
    return Number.isFinite(oldValue)
      ? oldValue + (value - oldValue) * weight
      : value;
  });
}

/**
 * Normalize the two face-detection response shapes used by the backends.
 * The admin endpoint reports the matched person inside `detections[]`, while
 * the employee endpoint also exposes `detected_user` at the top level.
 */
export function normalizeFaceDetectionResponse(payload: any): any {
  if (!payload || typeof payload !== 'object' || payload.success === false) {
    return payload;
  }

  const detections = Array.isArray(payload.detections)
    ? payload.detections
    : [];
  const matchedDetection = detections.find(
    (item: any) => item?.matched === true,
  );
  const primaryDetection = matchedDetection || detections[0] || null;
  const detectedCountValue = Number(payload.detected_count);
  const detectedCount = Number.isFinite(detectedCountValue)
    ? detectedCountValue
    : detections.length;
  const hasDetections = detections.length > 0 || detectedCount > 0;
  const topLevelDetected =
    typeof payload.detected === 'boolean' ? payload.detected : hasDetections;
  const matched = payload.matched === true || Boolean(matchedDetection);

  const payloadUser = payload.detected_user || payload.user || null;
  let detectedUser = payloadUser ? {...payloadUser} : null;
  if (detectedUser && matchedDetection) {
    detectedUser = {
      ...detectedUser,
      id: detectedUser.id ?? matchedDetection.id ?? matchedDetection.user_id,
      user_id:
        detectedUser.user_id
        ?? matchedDetection.user_id
        ?? matchedDetection.id,
      employee_id:
        detectedUser.employee_id
        || matchedDetection.employee_id
        || matchedDetection.employee_code
        || '',
      name: detectedUser.name || matchedDetection.name || '',
      department: detectedUser.department || matchedDetection.department || '',
      position: detectedUser.position || matchedDetection.position || '',
    };
  }
  if (!detectedUser && matchedDetection) {
    const userId = matchedDetection.user_id ?? matchedDetection.id ?? null;
    const employeeId =
      matchedDetection.employee_id || matchedDetection.employee_code || '';
    if (userId != null || employeeId || matchedDetection.name) {
      detectedUser = {
        id: matchedDetection.id ?? userId,
        user_id: matchedDetection.user_id ?? userId,
        employee_id: employeeId,
        name: matchedDetection.name || '',
        department: matchedDetection.department || '',
        position: matchedDetection.position || '',
      };
    }
  }

  const topLevelSimilarity = Number(payload.similarity_percent);
  const detectionSimilarity = Number(
    primaryDetection?.similarity_percent,
  );
  const similarityPercent = Number.isFinite(topLevelSimilarity)
    ? topLevelSimilarity
    : Number.isFinite(detectionSimilarity)
      ? detectionSimilarity
      : 0;

  return {
    ...payload,
    detected: topLevelDetected || hasDetections,
    detected_count: detectedCount,
    matched,
    detected_user: detectedUser,
    detection_bbox: payload.detection_bbox || primaryDetection?.bbox,
    similarity_percent: similarityPercent,
  };
}
