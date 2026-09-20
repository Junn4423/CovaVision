"""Application service for detection, matching, and attendance recognition."""

from __future__ import annotations

import base64
import binascii
import asyncio
import logging
import math
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from app.core.config import settings
from app.db.repository import Repository
from app.recognition.face_matching import FaceCandidate, find_best_match
from app.recognition.face_recognition_module import FaceRecognition

logger = logging.getLogger(__name__)


class RecognitionUnavailable(RuntimeError):
    """Raised when optional vision dependencies/models are not available."""


def decode_image_base64(value: str) -> bytes:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("image_base64 is required")
    if "," in raw and raw.lower().split(",", 1)[0].startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("image_base64 is invalid") from exc


class RecognitionService:
    """Lazy vision service so health/auth APIs do not load InsightFace."""

    def __init__(
        self,
        repository: Repository,
        *,
        recognizer_factory: Callable[[], Any] | None = None,
    ) -> None:
        self.repository = repository
        self._recognizer_factory = recognizer_factory or (
            lambda: FaceRecognition(det_thresh=settings.face_detection_threshold)
        )
        self._recognizer: Any | None = None
        self._recognizer_lock = threading.Lock()
        # InsightFace/ONNX sessions are not safe to execute concurrently from
        # arbitrary request threads. The async API can still serve other work
        # while one inference runs in a worker thread.
        self._inference_lock = threading.Lock()
        self._face_candidate_cache: dict[str, tuple[float, list[FaceCandidate]]] = {}
        self._attendance_lock: asyncio.Lock | None = None

    def _get_recognizer(self) -> Any:
        if self._recognizer is not None:
            return self._recognizer
        with self._recognizer_lock:
            if self._recognizer is None:
                try:
                    self._recognizer = self._recognizer_factory()
                except Exception as exc:  # pragma: no cover - depends on installed model stack
                    raise RecognitionUnavailable(
                        "Recognition engine chưa sẵn sàng. Hãy cài vision dependencies và model backend."
                    ) from exc
        return self._recognizer

    @staticmethod
    def _as_list(value: Any) -> list[float]:
        if hasattr(value, "tolist"):
            value = value.tolist()
        return [float(item) for item in value]

    async def encode_face(self, image_bytes: bytes) -> tuple[Any | None, str | None]:
        recognizer = self._get_recognizer()
        try:
            return recognizer.encode_face_from_bytes(image_bytes)
        except Exception as exc:
            return None, f"Không thể tạo face template: {exc}"

    async def detect(
        self,
        image_bytes: bytes,
        *,
        max_faces: int = 3,
        similarity_threshold: float | None = None,
        organization_id: str | None = None,
        anti_spoof_enabled: bool | None = None,
    ) -> dict[str, Any]:
        if not image_bytes:
            raise ValueError("Ảnh chấm công không được để trống")
        if len(image_bytes) > 8 * 1024 * 1024:
            raise ValueError("Ảnh chấm công vượt quá giới hạn 8 MB")

        recognizer = self._get_recognizer()
        if anti_spoof_enabled is None:
            anti_spoof_enabled = await self._anti_spoof_entitled(organization_id)
        decoder = getattr(recognizer, "_decode_image_bytes", None)
        if decoder is None:
            raise RecognitionUnavailable("Recognition engine thiếu bộ giải mã ảnh")
        try:
            frame = await asyncio.to_thread(decoder, image_bytes)
        except Exception as exc:
            logger.warning("Could not decode recognition image: %s", exc)
            raise ValueError("Không thể đọc ảnh chấm công") from exc
        if frame is None:
            raise ValueError("Không thể đọc ảnh chấm công")

        raw_faces, recognition_degraded = await self._detect_raw_faces(recognizer, frame)
        if recognition_degraded:
            return self._empty_detection_result(frame, anti_spoof_enabled=bool(anti_spoof_enabled), degraded=True)

        candidates = await self._get_face_candidates(organization_id)

        # Recognition policy belongs to the backend. Keeping a client-provided
        # threshold here made the live preview and final write disagree and
        # allowed a browser to lower the acceptance bar.
        threshold = max(0.0, min(1.0, float(settings.face_match_threshold)))
        detections = []
        try:
            max_face_limit = max(1, min(int(max_faces), 10))
        except (TypeError, ValueError):
            max_face_limit = 3
        frame_height, frame_width = self._frame_dimensions(frame)
        for raw_face in list(raw_faces or [])[:max_face_limit]:
            if not isinstance(raw_face, dict):
                continue
            bbox = self._normalize_bbox(raw_face.get("bbox"), frame_width, frame_height)
            if bbox is None:
                continue
            is_real_face = True
            liveness_score = 1.0
            if anti_spoof_enabled:
                is_real_face, liveness_score = self._check_liveness(recognizer, frame, bbox)
            embedding = raw_face.get("embedding")
            match = None
            if is_real_face and embedding is not None:
                try:
                    match = find_best_match(self._as_list(embedding), candidates, threshold=threshold)
                except ValueError:
                    match = None

            similarity = float(match.similarity) if match else 0.0
            detection = {
                "bbox": bbox,
                "det_score": self._safe_score(raw_face.get("det_score", 1.0)),
                "matched": match is not None,
                "similarity": similarity,
                "similarity_percent": round(similarity * 100, 2),
                "liveness_score": liveness_score,
                "is_real_face": is_real_face,
                "spoofed": anti_spoof_enabled and not is_real_face,
            }
            if match:
                detection.update({
                    "employee_id": match.employee_id,
                    "name": match.display_name,
                })
            detections.append(detection)

        matched_detection = next((item for item in detections if item["matched"]), None)
        detected_user = None
        if matched_detection:
            detected_user = {
                "id": matched_detection.get("employee_id"),
                "user_id": matched_detection.get("employee_id"),
                "employee_id": matched_detection.get("employee_id"),
                "name": matched_detection.get("name", ""),
            }

        return {
            "success": True,
            "detected": bool(detections),
            "detected_count": len(detections),
            "face_count": len(detections),
            "matched": matched_detection is not None,
            "detections": detections,
            "detected_user": detected_user,
            "detection_bbox": matched_detection["bbox"] if matched_detection else (detections[0]["bbox"] if detections else None),
            "similarity": matched_detection["similarity"] if matched_detection else 0.0,
            "similarity_percent": matched_detection["similarity_percent"] if matched_detection else 0.0,
            "anti_spoof_enabled": bool(anti_spoof_enabled),
            "spoof_detected": any(item.get("spoofed") for item in detections),
            "frame_width": frame_width,
            "frame_height": frame_height,
            "recognition_degraded": False,
        }

    async def _get_face_candidates(self, organization_id: str | None) -> list[FaceCandidate]:
        cache_key = str(organization_id or "__default__")
        now = time.monotonic()
        cache_seconds = max(0.0, float(settings.face_candidate_cache_seconds))
        cached = self._face_candidate_cache.get(cache_key)
        if cached and cache_seconds > 0 and now - cached[0] < cache_seconds:
            return cached[1]

        candidates: list[FaceCandidate] = []
        for item in await self.repository.list_face_candidates(organization_id):
            embedding = item.get("embedding")
            if embedding is None:
                embedding = item.get("face_encoding")
            if embedding is None:
                continue
            try:
                candidates.append(
                    FaceCandidate(
                        employee_id=str(item.get("employee_id") or item.get("id") or ""),
                        display_name=str(item.get("name") or item.get("employee_id") or "Unknown"),
                        embedding=self._as_list(embedding),
                    )
                )
            except (TypeError, ValueError):
                continue
        self._face_candidate_cache[cache_key] = (now, candidates)
        return candidates

    async def _detect_raw_faces(self, recognizer: Any, frame: Any) -> tuple[list[Any], bool]:
        def infer() -> list[Any]:
            with self._inference_lock:
                return list(recognizer.engine.detect_and_encode(frame) or [])

        try:
            return await asyncio.to_thread(infer), False
        except Exception as exc:
            logger.exception("Face inference failed; returning a safe no-face response: %s", exc)
            return [], True

    @staticmethod
    def _frame_dimensions(frame: Any) -> tuple[int, int]:
        try:
            height = int(frame.shape[0])
            width = int(frame.shape[1])
        except (AttributeError, IndexError, TypeError, ValueError):
            return 0, 0
        return max(0, height), max(0, width)

    @classmethod
    def _normalize_bbox(cls, value: Any, frame_width: int, frame_height: int) -> list[int] | None:
        try:
            values = [float(item) for item in list(value)[:4]]
        except (TypeError, ValueError):
            return None
        if len(values) < 4 or not all(math.isfinite(item) for item in values):
            return None
        x1, y1, x2, y2 = values
        if x2 <= x1 or y2 <= y1:
            return None
        if frame_width > 0:
            x1 = max(0.0, min(float(frame_width - 1), x1))
            x2 = max(0.0, min(float(frame_width), x2))
        if frame_height > 0:
            y1 = max(0.0, min(float(frame_height - 1), y1))
            y2 = max(0.0, min(float(frame_height), y2))
        if x2 <= x1 or y2 <= y1:
            return None
        return [int(x1), int(y1), int(x2), int(y2)]

    @staticmethod
    def _safe_score(value: Any) -> float:
        try:
            score = float(value)
        except (TypeError, ValueError):
            return 0.0
        return score if math.isfinite(score) else 0.0

    @staticmethod
    def _empty_detection_result(frame: Any, *, anti_spoof_enabled: bool, degraded: bool) -> dict[str, Any]:
        height, width = RecognitionService._frame_dimensions(frame)
        return {
            "success": True,
            "detected": False,
            "detected_count": 0,
            "face_count": 0,
            "matched": False,
            "detections": [],
            "detected_user": None,
            "detection_bbox": None,
            "similarity": 0.0,
            "similarity_percent": 0.0,
            "anti_spoof_enabled": anti_spoof_enabled,
            "spoof_detected": False,
            "frame_width": width,
            "frame_height": height,
            "recognition_degraded": degraded,
        }

    async def recognize(
        self,
        image_bytes: bytes,
        *,
        attendance_type: str = "auto",
        camera_id: str | None = None,
        location: Any = None,
        include_preview: bool = False,
        similarity_threshold: float | None = None,
        cooldown_seconds: Any = None,
        client_event_id: str | None = None,
        organization_id: str | None = None,
    ) -> dict[str, Any]:
        result = await self.detect(
            image_bytes,
            similarity_threshold=similarity_threshold,
            organization_id=organization_id,
        )
        if not result["matched"] or not result["detected_user"]:
            return {
                **result,
                "success": False,
                "mismatch": bool(result["detected"]),
                "message": "Không nhận diện được nhân viên trong ảnh.",
            }

        user = result["detected_user"]
        normalized_client_event_id = str(client_event_id or "").strip()
        if len(normalized_client_event_id) > 191:
            raise ValueError("client_event_id vượt quá 191 ký tự")
        async with self._get_attendance_lock():
            captured_at = datetime.now(timezone.utc)
            if normalized_client_event_id:
                existing = await self.repository.find_attendance_by_client_event(
                    normalized_client_event_id,
                    organization_id,
                )
                if existing is not None:
                    if str(existing.get("employee_id") or "") != str(user.get("employee_id") or ""):
                        raise ValueError("client_event_id đã được dùng cho nhân viên khác")
                    response = {
                        **result,
                        "success": True,
                        "duplicate": True,
                        "idempotency_duplicate": True,
                        "message": "Yêu cầu chấm công đã được ghi nhận trước đó.",
                        "user": user,
                        "record": existing,
                        "attendance": existing,
                    }
                    if include_preview:
                        response["preview_image_base64"] = (
                            "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
                        )
                    return response
            cooldown = settings.attendance_cooldown_seconds if cooldown_seconds is None else cooldown_seconds
            try:
                cooldown_value = max(0.0, float(cooldown))
            except (TypeError, ValueError):
                cooldown_value = float(settings.attendance_cooldown_seconds)
            if cooldown_value > 0:
                recent = await self.repository.find_recent_attendance(
                    str(user["employee_id"]),
                    captured_at - timedelta(seconds=cooldown_value),
                    organization_id,
                )
                if recent is not None:
                    response = {
                        **result,
                        "success": True,
                        "duplicate": True,
                        "message": "Nhân viên đã được ghi nhận trong khoảng thời gian vừa qua.",
                        "user": user,
                        "record": recent,
                        "attendance": recent,
                    }
                    if include_preview:
                        response["preview_image_base64"] = (
                            "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
                        )
                    return response
            shift_meta = await self._compute_shift_metadata(
                employee_id=str(user["employee_id"]),
                captured_at=captured_at,
                organization_id=organization_id,
            )
            attendance_type = shift_meta.get("attendance_type", "auto")
            record = await self.repository.create_attendance({
                "employee_id": user["employee_id"],
                "camera_id": camera_id,
                "attendance_type": attendance_type,
                "status": "accepted",
                "captured_at": captured_at.isoformat(),
                "confidence": result["similarity"],
                "location": location,
                "client_event_id": normalized_client_event_id or None,
                "organization_id": organization_id,
            })
            await self._store_attendance_snapshot(
                record,
                image_bytes,
                organization_id=organization_id,
            )
            await self._write_recognition_audit(
                result,
                record,
                camera_id=camera_id,
                client_event_id=normalized_client_event_id or None,
                organization_id=organization_id,
            )
        response = {
            **result,
            "success": True,
            "duplicate": False,
            "idempotency_duplicate": False,
            "message": "Quét mặt thành công, đã ghi nhận.",
            "user": user,
            "record": record,
            "attendance": record,
            **shift_meta,
        }
        if include_preview:
            response["preview_image_base64"] = (
                "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
            )
        return response

    async def _compute_shift_metadata(
        self,
        *,
        employee_id: str,
        captured_at: datetime,
        organization_id: str | None,
    ) -> dict[str, Any]:
        try:
            if hasattr(self.repository, "get_employee_shift_metadata"):
                meta = await self.repository.get_employee_shift_metadata(
                    employee_id,
                    captured_at,
                    organization_id,
                )
                if isinstance(meta, dict):
                    return meta
        except Exception:
            pass
        return {"attendance_type": "auto"}

    async def _store_attendance_snapshot(
        self,
        record: dict[str, Any],
        image_bytes: bytes,
        *,
        organization_id: str | None,
    ) -> None:
        if not settings.attendance_snapshot_enabled or not organization_id:
            return
        try:
            await self.repository.save_attendance_snapshot(
                str(record.get("id") or ""),
                image_bytes,
                organization_id,
            )
            retention_days = int(settings.attendance_snapshot_retention_days)
            if retention_days > 0:
                await self.repository.purge_attendance_snapshots(
                    datetime.now(timezone.utc) - timedelta(days=retention_days),
                    organization_id,
                )
        except Exception as exc:  # pragma: no cover - depends on storage/database availability
            logger.warning("Could not write attendance snapshot: %s", exc)

    async def _write_recognition_audit(
        self,
        result: dict[str, Any],
        record: dict[str, Any],
        *,
        camera_id: str | None,
        client_event_id: str | None,
        organization_id: str | None,
    ) -> None:
        if not organization_id:
            return
        details = {
            "employee_id": record.get("employee_id"),
            "camera_id": camera_id,
            "confidence": float(result.get("similarity") or 0.0),
            "anti_spoof_enabled": bool(result.get("anti_spoof_enabled", False)),
            "spoof_detected": bool(result.get("spoof_detected", False)),
            "client_event_id": client_event_id,
        }
        try:
            await self.repository.create_audit_log({
                "organization_id": organization_id,
                "action": "attendance.recognized",
                "entity_type": "attendance",
                "entity_id": record.get("id"),
                "details": details,
            })
        except Exception as exc:  # pragma: no cover - depends on database availability
            logger.warning("Could not write attendance audit event: %s", exc)

    async def _anti_spoof_entitled(self, organization_id: str | None) -> bool:
        if not organization_id:
            return False
        try:
            summary = await self.repository.get_billing_summary(organization_id)
            plan = summary.get("plan") or {}
            return bool(plan.get("anti_spoofing", False))
        except Exception:
            # An entitlement lookup failure must not silently enable a paid
            # biometric control or make Standard behave like Pro.
            return False

    @staticmethod
    def _check_liveness(recognizer: Any, frame: Any, bbox: list[int]) -> tuple[bool, float]:
        engine = getattr(recognizer, "engine", None)
        available = getattr(engine, "anti_spoofing_available", None)
        if available is False:
            return False, 0.0
        checker = getattr(engine, "check_anti_spoofing", None)
        if not callable(checker) or len(bbox) < 4:
            return False, 0.0
        try:
            x1, y1, x2, y2 = bbox[:4]
            result = checker(frame, [x1, y1, max(0, x2 - x1), max(0, y2 - y1)])
            if isinstance(result, (tuple, list)):
                is_real = bool(result[0])
                score = float(result[1]) if len(result) > 1 else (1.0 if is_real else 0.0)
            else:
                is_real = bool(result)
                score = 1.0 if is_real else 0.0
            return is_real, max(0.0, min(1.0, score))
        except Exception:
            return False, 0.0

    def _get_attendance_lock(self) -> asyncio.Lock:
        # Construct the lock inside the running event loop. This keeps the
        # service safe to instantiate from sync startup code and TestClient.
        if self._attendance_lock is None:
            self._attendance_lock = asyncio.Lock()
        return self._attendance_lock
