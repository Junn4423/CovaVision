"""Application service for detection, matching, and attendance recognition."""

from __future__ import annotations

import base64
import binascii
import asyncio
import math
import threading
from datetime import datetime, timezone
from typing import Any, Callable

from app.core.config import settings
from app.db.repository import Repository
from app.recognition.face_matching import FaceCandidate, find_best_match
from app.recognition.face_recognition_module import FaceRecognition


class RecognitionUnavailable(RuntimeError):
    """Raised when optional vision dependencies/models are not available."""


DEFAULT_ATTENDANCE_COOLDOWN_SECONDS = 30


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
    ) -> dict[str, Any]:
        if not image_bytes:
            raise ValueError("Ảnh chấm công không được để trống")
        if len(image_bytes) > 8 * 1024 * 1024:
            raise ValueError("Ảnh chấm công vượt quá giới hạn 8 MB")

        recognizer = self._get_recognizer()
        decoder = getattr(recognizer, "_decode_image_bytes", None)
        if decoder is None:
            raise RecognitionUnavailable("Recognition engine thiếu bộ giải mã ảnh")
        frame = decoder(image_bytes)
        if frame is None:
            raise ValueError("Không thể đọc ảnh chấm công")

        raw_faces = recognizer.engine.detect_and_encode(frame)
        candidates = []
        for item in await self.repository.list_face_candidates():
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

        threshold = settings.face_match_threshold if similarity_threshold is None else similarity_threshold
        threshold = max(0.0, min(1.0, float(threshold)))
        detections = []
        for raw_face in list(raw_faces or [])[: max(1, min(int(max_faces), 10))]:
            bbox = [int(float(value)) for value in list(raw_face.get("bbox", []))[:4]]
            embedding = raw_face.get("embedding")
            match = None
            if embedding is not None:
                try:
                    match = find_best_match(self._as_list(embedding), candidates, threshold=threshold)
                except ValueError:
                    match = None

            similarity = float(match.similarity) if match else 0.0
            detection = {
                "bbox": bbox,
                "det_score": float(raw_face.get("det_score", 1.0)),
                "matched": match is not None,
                "similarity": similarity,
                "similarity_percent": round(similarity * 100, 2),
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

        height, width = frame.shape[:2]
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
            "frame_width": width,
            "frame_height": height,
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
    ) -> dict[str, Any]:
        result = await self.detect(
            image_bytes,
            similarity_threshold=similarity_threshold,
        )
        if not result["matched"] or not result["detected_user"]:
            return {
                **result,
                "success": False,
                "mismatch": bool(result["detected"]),
                "message": "Không nhận diện được nhân viên trong ảnh.",
            }

        user = result["detected_user"]
        async with self._get_attendance_lock():
            cooldown = await self._resolve_cooldown_seconds(cooldown_seconds)
            if cooldown > 0:
                latest_record = await self._latest_employee_attendance(user["employee_id"])
                remaining = self._cooldown_remaining_seconds(latest_record, cooldown)
                if remaining > 0:
                    return {
                        **result,
                        "success": False,
                        "cooldown": True,
                        "cooldown_remaining_seconds": remaining,
                        "message": f"Nhân viên vừa chấm công. Vui lòng thử lại sau {remaining} giây.",
                        "user": user,
                        "record": latest_record,
                        "attendance": latest_record,
                    }

            record = await self.repository.create_attendance({
                "employee_id": user["employee_id"],
                "camera_id": camera_id,
                "attendance_type": attendance_type,
                "status": "accepted",
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "confidence": result["similarity"],
                "location": location,
            })
        response = {
            **result,
            "success": True,
            "message": "Chấm công thành công.",
            "user": user,
            "record": record,
            "attendance": record,
        }
        if include_preview:
            response["preview_image_base64"] = (
                "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("ascii")
            )
        return response

    def _get_attendance_lock(self) -> asyncio.Lock:
        # Construct the lock inside the running event loop. This keeps the
        # service safe to instantiate from sync startup code and TestClient.
        if self._attendance_lock is None:
            self._attendance_lock = asyncio.Lock()
        return self._attendance_lock

    async def _resolve_cooldown_seconds(self, requested: Any) -> int:
        configured = await self.repository.get_settings()
        nested = configured.get("attendance_settings")
        if isinstance(nested, dict):
            for key in ("cooldown_seconds", "attendance_cooldown_seconds"):
                if key in nested:
                    return self._coerce_cooldown_seconds(
                        nested.get(key),
                        default=DEFAULT_ATTENDANCE_COOLDOWN_SECONDS,
                    )
        for key in ("attendance_cooldown_seconds", "cooldown_seconds"):
            if key in configured:
                    return self._coerce_cooldown_seconds(
                        configured.get(key),
                        default=DEFAULT_ATTENDANCE_COOLDOWN_SECONDS,
                    )
        if requested is not None:
            return self._coerce_cooldown_seconds(requested, default=0)
        return DEFAULT_ATTENDANCE_COOLDOWN_SECONDS

    @staticmethod
    def _coerce_cooldown_seconds(value: Any, *, default: int) -> int:
        try:
            parsed = math.floor(float(value))
        except (TypeError, ValueError, OverflowError):
            return default
        return max(0, min(parsed, 7 * 24 * 60 * 60))

    async def _latest_employee_attendance(self, employee_id: str) -> dict[str, Any] | None:
        records = await self.repository.list_attendance({"employee_id": employee_id})
        latest_record = None
        latest_at = None
        for record in records:
            if str(record.get("status") or "accepted").lower() != "accepted":
                continue
            captured_at = self._parse_timestamp(record.get("captured_at") or record.get("created_at"))
            if captured_at is not None and (latest_at is None or captured_at > latest_at):
                latest_at = captured_at
                latest_record = record
        return latest_record

    @staticmethod
    def _parse_timestamp(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            parsed = value
        elif value:
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError:
                return None
        else:
            return None
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)

    @classmethod
    def _cooldown_remaining_seconds(cls, record: dict[str, Any] | None, cooldown: int) -> int:
        if not record:
            return 0
        captured_at = cls._parse_timestamp(record.get("captured_at") or record.get("created_at"))
        if captured_at is None:
            return 0
        elapsed = max(0, int((datetime.now(timezone.utc) - captured_at).total_seconds()))
        return max(0, cooldown - elapsed)
