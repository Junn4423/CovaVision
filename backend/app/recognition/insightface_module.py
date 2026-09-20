import os
import sys
import threading

from app.core.config import settings
from app.core.runtime import resolve_data_dir, resolve_project_root
from app.recognition.vision_dependencies import cv2, np, require_vision_dependencies

INTEL_OPTIMIZATION = {
    'omp_num_threads': 1,
    'mkl_num_threads': 1,
    'use_onnx_antispoof': True,
}

PERFORMANCE_CONFIG = {
    'detection_width': settings.face_detection_width,
    'detection_height': settings.face_detection_height,
}

# Note: InsightFace and Anti-Spoofing home will be set dynamically based on frozen state below.

# Use a dedicated init log if available (shared with app.py)
def _log_init(message):
    print(f"[InsightFaceModule] {message}")
    try:
        _INIT_LOG_PATH = resolve_data_dir() / 'covavision_init.log'
        from datetime import datetime
        with open(_INIT_LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(f"[{datetime.now().isoformat()}] [InsightFaceModule] {message}\n")
    except Exception:
        pass

# We'll import these lazily inside the classes
# import insightface
# from insightface.app import FaceAnalysis

os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')
os.environ.setdefault('OMP_NUM_THREADS', str(INTEL_OPTIMIZATION['omp_num_threads']))
os.environ.setdefault('MKL_NUM_THREADS', str(INTEL_OPTIMIZATION['mkl_num_threads']))

if getattr(sys, 'frozen', False):
    # In PyInstaller --onedir mode, _MEIPASS == _internal directory that holds data files
    _meipass = getattr(sys, '_MEIPASS', '')
    _exe_dir = os.path.dirname(sys.executable)
    _candidates = [
        _meipass,
        os.path.join(_exe_dir, '_internal'),
        _exe_dir,
    ]
    
    # Try to find Silent-Face-Anti-Spoofing or models folder
    # We prioritize _internal as that's where COLLECT/onedir puts data files
    PROJECT_ROOT = _meipass or _exe_dir
    for _c in _candidates:
        if _c and os.path.isdir(os.path.join(_c, 'Silent-Face-Anti-Spoofing')):
            PROJECT_ROOT = _c
            _log_init(f"Found PROJECT_ROOT (via Silent-Face-Anti-Spoofing): {PROJECT_ROOT}")
            break
    else:
        # Fallback if Silent-Face-Anti-Spoofing not found, use _meipass or _internal
        PROJECT_ROOT = _meipass or (os.path.join(_exe_dir, '_internal') if os.path.isdir(os.path.join(_exe_dir, '_internal')) else _exe_dir)
        _log_init(f"Silent-Face-Anti-Spoofing not found, using fallback PROJECT_ROOT: {PROJECT_ROOT}")

    # Set InsightFace Home to the bundled models
    # Candidates for INSIGHTFACE_HOME:
    # 1. _internal/insightface_models (bundled)
    # 2. data_dir/insightface_models (seeded)
    # 3. ~/.insightface (default)
    
    data_dir = resolve_data_dir()
    candidates = [
        os.environ.get('INSIGHTFACE_HOME'),
        os.path.join(PROJECT_ROOT, 'insightface_models'),
        os.path.join(PROJECT_ROOT, '_internal', 'insightface_models'),
        os.path.join(data_dir, 'insightface_models'),
        os.path.join(os.path.expanduser('~'), '.insightface')
    ]
    
    insightface_home = None
    for cand in candidates:
        if os.path.isdir(cand) and os.path.isdir(os.path.join(cand, 'models')):
            insightface_home = cand
            break
            
    if insightface_home:
        os.environ['INSIGHTFACE_HOME'] = insightface_home
        _log_init(f"Setting INSIGHTFACE_HOME to: {insightface_home}")
    else:
        _log_init(f"Warning: No valid insightface_models directory found in candidates: {candidates}")

else:
    PROJECT_ROOT = str(resolve_project_root())
    print(f"[CovaVision] Running in dev, PROJECT_ROOT: {PROJECT_ROOT}")

# In Docker, Silent-Face-Anti-Spoofing and models might be in /app/instance/
_DOCKER_INSTANCE_ROOT = os.path.join(PROJECT_ROOT, 'instance')
ANTI_SPOOF_SRC_DIR = os.path.join(PROJECT_ROOT, 'Silent-Face-Anti-Spoofing', 'src')
if not os.path.isdir(ANTI_SPOOF_SRC_DIR):
    # Try instance folder (common in Docker volumes)
    _alt_path = os.path.join(_DOCKER_INSTANCE_ROOT, 'Silent-Face-Anti-Spoofing', 'src')
    if os.path.isdir(_alt_path):
        ANTI_SPOOF_SRC_DIR = _alt_path

if ANTI_SPOOF_SRC_DIR not in sys.path:
    if os.path.isdir(ANTI_SPOOF_SRC_DIR):
        sys.path.append(ANTI_SPOOF_SRC_DIR)
        print(f"[CovaVision] Added {ANTI_SPOOF_SRC_DIR} to sys.path")
    else:
        print(f"[CovaVision] Warning: Anti-spoofing src dir not found: {ANTI_SPOOF_SRC_DIR}")

try:
    from generate_patches import CropImage
except ImportError:
    CropImage = None


def parse_model_name(model_name):
    stem = os.path.splitext(os.path.basename(model_name))[0]
    info = stem.split('_')[0:-1]
    h_input, w_input = info[-1].split('x')
    model_type = stem.split('_')[-1]
    scale = None if info[0] == 'org' else float(info[0])
    return int(h_input), int(w_input), model_type, scale


def softmax(values):
    shifted = values - np.max(values, axis=1, keepdims=True)
    exp_values = np.exp(shifted)
    return exp_values / np.sum(exp_values, axis=1, keepdims=True)


def build_prediction_score(prediction, model_count):
    label = int(np.argmax(prediction))
    value = float(prediction[0][label] / max(1, model_count))
    return label == 1, value


def get_default_anti_spoof_dirs(model_dir):
    candidate_dirs = [os.path.abspath(model_dir)]
    resource_dir = os.path.join(PROJECT_ROOT, 'Silent-Face-Anti-Spoofing', 'resources', 'anti_spoof_models')
    fallback_dir = os.path.join(PROJECT_ROOT, 'models')
    for path in (resource_dir, fallback_dir):
        abs_path = os.path.abspath(path)
        if abs_path not in candidate_dirs:
            candidate_dirs.append(abs_path)
    return candidate_dirs


def get_runtime_onnx_providers():
    try:
        import onnxruntime as ort

        available = list(ort.get_available_providers())
    except Exception:
        available = []

    preferred = []
    if 'OpenVINOExecutionProvider' in available:
        preferred.append('OpenVINOExecutionProvider')
    if 'CPUExecutionProvider' in available:
        preferred.append('CPUExecutionProvider')
    if not preferred:
        preferred = ['CPUExecutionProvider']

    return preferred, available


class OnnxAntiSpoofingWrapper:
    def __init__(self, model_dir='Silent-Face-Anti-Spoofing/resources/anti_spoof_models'):
        if CropImage is None:
            raise ImportError('generate_patches (Silent-Face-Anti-Spoofing) not available')
        import onnxruntime as ort

        self.cropper = CropImage()
        available_providers = ort.get_available_providers()
        providers = [p for p in ('CPUExecutionProvider',) if p in available_providers]
        if not providers:
            providers = ['CPUExecutionProvider']

        self.sessions = []
        seen_paths = set()
        for candidate_dir in get_default_anti_spoof_dirs(model_dir):
            if not os.path.isdir(candidate_dir):
                continue
            for model_name in sorted(os.listdir(candidate_dir)):
                if not model_name.endswith('.onnx'):
                    continue
                model_path = os.path.join(candidate_dir, model_name)
                if model_path in seen_paths:
                    continue
                session = ort.InferenceSession(model_path, providers=providers)
                self.sessions.append({
                    'path': model_path,
                    'input_name': session.get_inputs()[0].name,
                    'session': session,
                })
                seen_paths.add(model_path)

        if not self.sessions:
            raise FileNotFoundError('No ONNX anti-spoof models found')

    def is_real_face(self, frame, bbox):
        prediction = np.zeros((1, 3), dtype=np.float32)
        for model_info in self.sessions:
            h_input, w_input, _model_type, scale = parse_model_name(model_info['path'])
            crop_params = {
                'org_img': frame,
                'bbox': bbox,
                'scale': scale,
                'out_w': w_input,
                'out_h': h_input,
                'crop': scale is not None,
            }
            img = self.cropper.crop(**crop_params)
            tensor = img.transpose((2, 0, 1)).astype(np.float32, copy=False)
            tensor = np.expand_dims(tensor, axis=0)
            logits = model_info['session'].run(None, {model_info['input_name']: tensor})[0]
            prediction += softmax(logits)
        return build_prediction_score(prediction, len(self.sessions))


class TorchAntiSpoofingWrapper:
    def __init__(self, model_dir='Silent-Face-Anti-Spoofing/resources/anti_spoof_models', device_id=0):
        if CropImage is None:
            raise ImportError('generate_patches (Silent-Face-Anti-Spoofing) not available')
        import torch

        self.cropper = CropImage()
        self.device = torch.device("cpu")
        self.model_paths = []
        self._cached_models = {}  # Pre-loaded models to avoid reload on every predict
        seen_paths = set()
        for candidate_dir in get_default_anti_spoof_dirs(model_dir):
            if not os.path.isdir(candidate_dir):
                continue
            for model_name in sorted(os.listdir(candidate_dir)):
                if not model_name.endswith('.pth'):
                    continue
                model_path = os.path.join(candidate_dir, model_name)
                if model_path in seen_paths:
                    continue
                self.model_paths.append(model_path)
                seen_paths.add(model_path)

        if not self.model_paths:
            raise FileNotFoundError('No PyTorch anti-spoof models found')

        # Pre-load all models once at init instead of reloading on every predict
        from model_lib.MiniFASNet import MiniFASNetV1, MiniFASNetV2, MiniFASNetV1SE, MiniFASNetV2SE
        from utility import get_kernel
        _MODEL_MAPPING = {
            'MiniFASNetV1': MiniFASNetV1,
            'MiniFASNetV2': MiniFASNetV2,
            'MiniFASNetV1SE': MiniFASNetV1SE,
            'MiniFASNetV2SE': MiniFASNetV2SE
        }
        for model_path in self.model_paths:
            try:
                model_name = os.path.basename(model_path)
                h_input, w_input, model_type, _ = parse_model_name(model_path)
                kernel_size = get_kernel(h_input, w_input)
                model = _MODEL_MAPPING[model_type](conv6_kernel=kernel_size).to(self.device)
                state_dict = torch.load(model_path, map_location=self.device)
                keys = iter(state_dict)
                first_layer_name = next(keys)
                if first_layer_name.find('module.') >= 0:
                    from collections import OrderedDict
                    new_state_dict = OrderedDict()
                    for key, value in state_dict.items():
                        new_state_dict[key[7:]] = value
                    model.load_state_dict(new_state_dict)
                else:
                    model.load_state_dict(state_dict)
                model.eval()
                self._cached_models[model_path] = model
                print(f'  Loaded anti-spoof model: {model_name}')
            except Exception as e:
                print(f'  Warning: failed to load anti-spoof model {model_path}: {e}')

    def is_real_face(self, frame, bbox):
        import torch
        import torch.nn.functional as F
        from data_io import transform as trans

        prediction = np.zeros((1, 3), dtype=np.float32)
        test_transform = trans.Compose([trans.ToTensor()])
        model_count = 0
        for model_path in self.model_paths:
            model = self._cached_models.get(model_path)
            if model is None:
                continue
            h_input, w_input, _model_type, scale = parse_model_name(model_path)
            crop_params = {
                'org_img': frame,
                'bbox': bbox,
                'scale': scale,
                'out_w': w_input,
                'out_h': h_input,
                'crop': scale is not None,
            }
            img = self.cropper.crop(**crop_params)
            if img is None or img.size == 0:
                continue
            img_tensor = test_transform(img)
            img_tensor = img_tensor.unsqueeze(0).to(self.device)
            with torch.no_grad():
                result = model.forward(img_tensor)
                result = F.softmax(result, dim=1).cpu().numpy()
            prediction += result
            model_count += 1
        if model_count == 0:
            return True, 1.0
        return build_prediction_score(prediction, model_count)


class AntiSpoofingWrapper:
    def __init__(self, model_dir=None, device_id=0):
        self.backend = None
        
        # Resolve model_dir relative to PROJECT_ROOT if not provided
        if model_dir is None:
            # Priority search for anti-spoofing models
            candidates = [
                os.path.join(PROJECT_ROOT, 'models'),
                os.path.join(PROJECT_ROOT, 'Silent-Face-Anti-Spoofing', 'resources', 'anti_spoof_models'),
                os.path.join(PROJECT_ROOT, '_internal', 'models'),
                os.path.join(PROJECT_ROOT, '_internal', 'Silent-Face-Anti-Spoofing', 'resources', 'anti_spoof_models'),
            ]
            
            for cand in candidates:
                if os.path.isdir(cand) and any(f.endswith(('.pth', '.onnx')) for f in os.listdir(cand)):
                    model_dir = cand
                    break
        
        if not model_dir:
            model_dir = os.path.join(PROJECT_ROOT, 'models') # Fallback
            
        _log_init(f"Anti-spoofing initializing with model_dir: {model_dir}")

        if CropImage is None:
            _log_init('Anti-spoofing: DISABLED (missing Silent-Face-Anti-Spoofing/src)')
            return

        if INTEL_OPTIMIZATION['use_onnx_antispoof']:
            try:
                self.backend = OnnxAntiSpoofingWrapper(model_dir=model_dir)
                _log_init('Anti-spoofing backend: ONNX Runtime')
            except Exception as exc:
                _log_init(f'Warning: ONNX anti-spoofing unavailable, falling back to PyTorch: {exc}')

        if self.backend is None:
            try:
                self.backend = TorchAntiSpoofingWrapper(model_dir=model_dir, device_id=device_id)
                print('Anti-spoofing backend: PyTorch')
            except Exception as exc:
                _log_init(f'Warning: PyTorch anti-spoofing also unavailable: {exc}')
                _log_init('Anti-spoofing: DISABLED')

    def is_real_face(self, frame, bbox):
        if self.backend is None:
            return True, 1.0
        return self.backend.is_real_face(frame, bbox)


class InsightFaceWrapper:
    def __init__(self, device='cpu', det_thresh=0.5, det_size=None):
        require_vision_dependencies()
        # Lazy import of insightface
        try:
            import insightface
            from insightface.app import FaceAnalysis
        except ImportError as e:
            _log_init(f"InsightFace import failed: {e}")
            raise

        if det_size is None:
            det_size = (
                PERFORMANCE_CONFIG['detection_width'],
                PERFORMANCE_CONFIG['detection_height']
            )

        providers, available_providers = get_runtime_onnx_providers()
        
        # Use bundled models if available
        insightface_home = os.environ.get('INSIGHTFACE_HOME')
        if insightface_home and os.path.isdir(insightface_home):
             _log_init(f"Initializing FaceAnalysis with root={insightface_home}")
             self.app = FaceAnalysis(name='buffalo_s', root=insightface_home, providers=providers)
        else:
             _log_init(f"Initializing FaceAnalysis with default root")
             self.app = FaceAnalysis(name='buffalo_s', providers=providers)
             
        self.app.prepare(ctx_id=0, det_size=det_size, det_thresh=det_thresh)

        _log_init('InsightFace initialized with runtime provider selection')
        if available_providers:
            _log_init(f'  Available providers: {", ".join(available_providers)}')
        _log_init(f'  Selected providers: {", ".join(providers)}')
        _log_init(f'  Detection size: {det_size}, Threshold: {det_thresh}')
        if 'OpenVINOExecutionProvider' not in providers:
            _log_init('  OpenVINOExecutionProvider unavailable, using CPUExecutionProvider')

        self.anti_spoofing = AntiSpoofingWrapper()
        self.anti_spoofing_available = self.anti_spoofing.backend is not None
        self._lock = threading.RLock()

    def detect_and_encode(self, frame):
        with self._lock:
            faces = self.app.get(frame)
        results = []
        for face in faces:
            results.append({
                'bbox': face.bbox.astype(int),
                'embedding': face.embedding,
                'kps': face.kps,
                'det_score': float(getattr(face, 'det_score', 1.0)),
            })
        return results

    def check_anti_spoofing(self, frame, bbox_xywh):
        # Validate bbox before passing to anti-spoofing
        x, y, w, h = bbox_xywh[0], bbox_xywh[1], bbox_xywh[2], bbox_xywh[3]
        if w <= 0 or h <= 0:
            return True, 1.0
        frame_h, frame_w = frame.shape[:2]
        # Clamp to frame bounds
        x = max(0, min(x, frame_w - 1))
        y = max(0, min(y, frame_h - 1))
        w = min(w, frame_w - x)
        h = min(h, frame_h - y)
        if w <= 10 or h <= 10:
            return True, 1.0
        safe_bbox = [int(x), int(y), int(w), int(h)]
        try:
            with self._lock:
                return self.anti_spoofing.is_real_face(frame, safe_bbox)
        except Exception as e:
            print(f'Anti-spoofing error: {e}')
            return True, 1.0

    def compute_sim(self, feat1, feat2):
        return np.dot(feat1, feat2) / (np.linalg.norm(feat1) * np.linalg.norm(feat2))
