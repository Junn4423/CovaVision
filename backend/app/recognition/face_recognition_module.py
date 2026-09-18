import base64
import io
import os
import threading

from app.core.config import settings
from app.recognition.face_encoding_utils import normalize_face_encodings
from app.recognition.insightface_module import InsightFaceWrapper
from app.recognition.vision_dependencies import (
    Image,
    ImageDraw,
    ImageFont,
    ImageOps,
    cv2,
    np,
    require_vision_dependencies,
)


class FaceRecognition:
    def __init__(self, det_thresh=0.5, det_size=None):
        require_vision_dependencies()
        self.known_face_encodings = []
        self.known_face_names = []
        self.known_face_ids = []

        self.det_thresh = float(det_thresh)
        self.det_size = det_size or (
            settings.face_detection_width,
            settings.face_detection_height,
        )
        self.engine = InsightFaceWrapper(det_thresh=self.det_thresh, det_size=self.det_size)

        self._relaxed_engine = None
        self._relaxed_engine_lock = threading.Lock()

    def _get_relaxed_engine(self):
        if self._relaxed_engine is not None:
            return self._relaxed_engine

        with self._relaxed_engine_lock:
            if self._relaxed_engine is None:
                # Manual uploads can be harder than employee photos because users often submit
                # backlit portrait selfies. Match the importer's relaxed detector settings.
                relaxed_thresh = min(self.det_thresh, 0.30)
                relaxed_size = (640, 640)
                self._relaxed_engine = InsightFaceWrapper(
                    det_thresh=relaxed_thresh,
                    det_size=relaxed_size,
                )
        return self._relaxed_engine

    @staticmethod
    def _decode_image_bytes(image_bytes):
        if not image_bytes:
            return None

        try:
            pil_img = Image.open(io.BytesIO(image_bytes))
            pil_img = ImageOps.exif_transpose(pil_img)
            if pil_img.mode != 'RGB':
                pil_img = pil_img.convert('RGB')
            rgb = np.array(pil_img)
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception:
            image_arr = np.frombuffer(image_bytes, np.uint8)
            return cv2.imdecode(image_arr, cv2.IMREAD_COLOR)

    @staticmethod
    def _pad_to_square(image):
        h, w = image.shape[:2]
        if h == w:
            return image

        side = max(h, w)
        top = (side - h) // 2
        bottom = side - h - top
        left = (side - w) // 2
        right = side - w - left
        return cv2.copyMakeBorder(
            image,
            top,
            bottom,
            left,
            right,
            borderType=cv2.BORDER_CONSTANT,
            value=(0, 0, 0),
        )

    @staticmethod
    def _enhance_for_detection(image):
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        lightness, channel_a, channel_b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        lightness = clahe.apply(lightness)
        merged = cv2.merge((lightness, channel_a, channel_b))
        enhanced = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)

        # A light sharpen helps when the face is a bit soft because of phone smoothing.
        return cv2.addWeighted(enhanced, 1.15, cv2.GaussianBlur(enhanced, (0, 0), 2.0), -0.15, 0)

    @staticmethod
    def _candidate_frames(image):
        candidates = [image]
        h, w = image.shape[:2]

        max_edge = max(h, w)
        min_edge = min(h, w)

        for target_edge in (1920, 1600, 1280, 1024, 896, 768, 640):
            if max_edge > target_edge:
                scale = target_edge / float(max_edge)
                resized = cv2.resize(image, (max(1, int(w * scale)), max(1, int(h * scale))))
                candidates.append(resized)

        if min_edge < 480:
            scale = 640.0 / max(1.0, min_edge)
            upscaled = cv2.resize(image, (int(w * scale), int(h * scale)))
            candidates.append(upscaled)

        for ratio in (0.92, 0.84, 0.76):
            crop_w = max(1, int(w * ratio))
            crop_h = max(1, int(h * ratio))
            left = max(0, (w - crop_w) // 2)
            top = max(0, (h - crop_h) // 2)

            centered = image[top:top + crop_h, left:left + crop_w]
            if centered.size:
                candidates.append(centered)

            top_biased = max(0, min(h - crop_h, int((h - crop_h) * 0.35)))
            top_centered = image[top_biased:top_biased + crop_h, left:left + crop_w]
            if top_centered.size:
                candidates.append(top_centered)

        candidates.append(cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE))
        candidates.append(cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE))
        return candidates

    def _build_relaxed_variants(self, image):
        variants = [image]

        padded = self._pad_to_square(image)
        if padded.shape[:2] != image.shape[:2]:
            variants.append(padded)

        enhanced = self._enhance_for_detection(image)
        variants.append(enhanced)

        enhanced_padded = self._pad_to_square(enhanced)
        if enhanced_padded.shape[:2] != enhanced.shape[:2]:
            variants.append(enhanced_padded)

        return variants

    @staticmethod
    def _pick_primary_face(results):
        if not results:
            return None
        if len(results) == 1:
            return results[0]
        return sorted(
            results,
            key=lambda x: (x['bbox'][2] - x['bbox'][0]) * (x['bbox'][3] - x['bbox'][1]),
            reverse=True,
        )[0]

    def _find_face_with_engine(self, engine, frames):
        for frame in frames:
            results = engine.detect_and_encode(frame)
            best_face = self._pick_primary_face(results)
            if best_face is not None:
                return best_face
        return None

    def encode_face_from_bytes(self, image_bytes):
        image = self._decode_image_bytes(image_bytes)
        if image is None:
            return None, 'Không thể đọc file ảnh'

        h, w = image.shape[:2]

        all_embeddings = []
        best_face = self._find_face_with_engine(self.engine, self._candidate_frames(image))
        if best_face is not None:
            all_embeddings.append(best_face['embedding'])

        relaxed_frames = []
        for variant in self._build_relaxed_variants(image):
            relaxed_frames.extend(self._candidate_frames(variant))

        rel_face = self._find_face_with_engine(self._get_relaxed_engine(), relaxed_frames)
        if rel_face is not None:
            all_embeddings.append(rel_face['embedding'])

        if all_embeddings:
            return all_embeddings[0], None

        relaxed_frames = []
        for variant in self._build_relaxed_variants(image):
            relaxed_frames.extend(self._candidate_frames(variant))

        best_face = self._find_face_with_engine(self._get_relaxed_engine(), relaxed_frames)
        if best_face is not None:
            return best_face['embedding'], None

        return None, (
            f'Không tìm thấy khuôn mặt trong ảnh (kích thước: {w}x{h}). '
            'Đã thử detector chuẩn và detector relaxed.'
        )

    def load_known_faces(self, users):
        self.known_face_encodings = []
        self.known_face_names = []
        self.known_face_ids = []

        temp_encodings = []

        for user in users:
            for encoding in normalize_face_encodings(user.face_encoding):
                enc_arr = np.array(encoding)
                if enc_arr.shape == (512,):
                    temp_encodings.append(enc_arr)
                    self.known_face_names.append(user.name)
                    self.known_face_ids.append(user.id)

        if len(temp_encodings) > 0:
            self.known_face_encodings = np.array(temp_encodings)
            norms = np.linalg.norm(self.known_face_encodings, axis=1)
            self.known_face_encodings = self.known_face_encodings / norms[:, np.newaxis]
        else:
            self.known_face_encodings = np.empty((0, 512))

    def encode_face_from_image(self, image_file):
        if isinstance(image_file, (str, os.PathLike)):
            with open(str(image_file), 'rb') as handle:
                image_bytes = handle.read()
        else:
            if hasattr(image_file, 'seek'):
                try:
                    image_file.seek(0)
                except Exception:
                    pass
            image_bytes = image_file.read()

        return self.encode_face_from_bytes(image_bytes)

    def encode_face_from_base64(self, base64_string):
        try:
            if ',' in base64_string:
                base64_string = base64_string.split(',')[1]

            image_bytes = base64.b64decode(base64_string)
            return self.encode_face_from_bytes(image_bytes)
        except Exception as exc:
            return None, f'Lỗi xử lý ảnh base64: {exc}'

    def compute_distance(self, face_encodings, face_to_compare):
        if len(face_encodings) == 0:
            return np.empty((0))

        face_to_compare = np.array(face_to_compare)
        norm_to_compare = np.linalg.norm(face_to_compare)

        if norm_to_compare == 0:
            return np.ones(len(face_encodings))

        normalized_to_compare = face_to_compare / norm_to_compare
        similarities = np.dot(face_encodings, normalized_to_compare)
        distances = 1.0 - similarities
        return distances

    def compare_faces(self, known_face_encodings, face_encoding_to_check, tolerance=0.6):
        distances = self.compute_distance(known_face_encodings, face_encoding_to_check)
        return list(distances <= tolerance)

    def recognize_face_from_frame(self, frame):
        results = self.engine.detect_and_encode(frame)

        face_locations = []
        face_names = []
        face_ids = []
        face_encodings = []
        min_distances = []

        for res in results:
            bbox = res['bbox']
            embedding = res['embedding']

            face_loc = (bbox[1], bbox[2], bbox[3], bbox[0])
            face_locations.append(face_loc)
            face_encodings.append(embedding)

            name = 'Unknown'
            user_id = None
            min_dist = 0.0

            if len(self.known_face_encodings) > 0:
                known_encodings = self.known_face_encodings
                curr_emb = embedding / np.linalg.norm(embedding)
                similarities = np.dot(known_encodings, curr_emb)
                best_match_index = np.argmax(similarities)
                best_sim = similarities[best_match_index]

                if best_sim >= 0.28:
                    name = self.known_face_names[best_match_index]
                    user_id = self.known_face_ids[best_match_index]
                    min_dist = 1.0 - best_sim
                else:
                    min_dist = 1.0 - best_sim

            face_names.append(name)
            face_ids.append(user_id)
            min_distances.append(min_dist)

        return face_locations, face_names, face_ids, face_encodings, min_distances

    def draw_faces_on_frame(self, frame, face_locations, face_names):
        if not face_locations:
            return frame

        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_frame)
            draw = ImageDraw.Draw(pil_image)

            try:
                font_path = os.path.join(os.path.dirname(__file__), '..', '..', 'static', 'fonts', 'DejaVuSans.ttf')
                font = ImageFont.truetype(font_path, 40)
            except (IOError, OSError):
                font = ImageFont.load_default()

            for (top, right, bottom, left), name in zip(face_locations, face_names):
                name = name or 'Unknown'
                color = (0, 255, 0) if name != 'Unknown' else (0, 0, 255)
                draw.rectangle(((left, top), (right, bottom)), outline=color, width=2)

                try:
                    text_bbox = draw.textbbox((left, bottom), name, font=font)
                    text_width = text_bbox[2] - text_bbox[0]
                    text_height = text_bbox[3] - text_bbox[1]
                except Exception:
                    text_width = len(name) * 20
                    text_height = 30

                draw.rectangle(((left, bottom), (left + text_width + 4, bottom + text_height + 4)), fill=color)
                draw.text((left + 6, bottom + 2), name, font=font, fill=(255, 255, 255))

            return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        except Exception as exc:
            print(f'draw_faces_on_frame error: {exc}')
            return frame

    @staticmethod
    def frame_to_base64(frame):
        _, buffer = cv2.imencode('.jpg', frame)
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        return f'data:image/jpeg;base64,{frame_base64}'
