# CovaVision — Third-Party Notices

Last reviewed: 2026-09-20

This file records the third-party computer-vision components referenced by the
CovaVision source tree. It is intended to ship with source and release builds,
or to be exposed from a visible "Open source licenses" screen in the desktop
and mobile applications.

This is a component notice, not a grant of commercial rights for any model
weights. The exact licenses shipped in a release must be re-checked against the
versions and model files included in that release.

## Components used by the current vision backend

### InsightFace Python SDK — MIT (code only)

CovaVision imports `insightface.app.FaceAnalysis` from
`backend/app/recognition/insightface_module.py`.

- Upstream: <https://github.com/deepinsight/insightface>
- Upstream licensing statement: <https://github.com/deepinsight/insightface/blob/master/server/LICENSING.md>
- The InsightFace Python SDK code is MIT-licensed and may be used commercially,
  subject to preserving the applicable copyright and permission notices.
- This notice does **not** license InsightFace pretrained model weights.

When packaging a binary, retain the license/copyright files supplied by the
exact InsightFace package version used by the build.

### ONNX Runtime — MIT

Used as the ONNX inference runtime by InsightFace and by the optional
anti-spoofing path.

- Upstream: <https://github.com/microsoft/onnxruntime>
- License: <https://github.com/microsoft/onnxruntime/blob/main/LICENSE>
- Copyright: Microsoft Corporation

The MIT notice and permission text from the upstream license must accompany
redistributed binaries or source copies.

### OpenCV — Apache-2.0; Python packaging layer — MIT

CovaVision uses `opencv-python-headless` for image decoding and preprocessing.
The Python packaging layer is MIT-licensed; the OpenCV project itself is
Apache-2.0-licensed.

- OpenCV: <https://github.com/opencv/opencv/blob/4.x/LICENSE>
- opencv-python packaging layer: <https://github.com/opencv/opencv-python/blob/master/LICENSE.txt>

Both applicable notices must be retained in a redistributed release.

## Model status — important

### InsightFace `buffalo_s` — NOT MIT / commercial rights not included

The backend calls `FaceAnalysis(name='buffalo_s')`. The model pack includes
pretrained detection and recognition weights. InsightFace documents the public
pretrained model packs, including automatically downloaded packs, as
non-commercial research use unless separate commercial authorization is
obtained.

- Model Zoo policy: <https://github.com/deepinsight/insightface/blob/master/python-package/docs/model_zoo.md>
- Commercial licensing: <https://www.insightface.ai/solutions/face-recognition-licensing>
- The model must not be described as MIT-licensed.
- A commercial build must either include written commercial authorization for
  the exact model package or replace the model with a separately verified
  commercial-use model.

The Windows installer currently initializes `FaceRecognition()` to warm/cache
`buffalo_s`. Until a commercial model license is obtained, the installer and
release process must treat that model as research-only.

### Silent-Face-Anti-Spoofing — conditional, not currently bundled

The source contains an optional integration path for a local
`Silent-Face-Anti-Spoofing` checkout, but that checkout and its model files are
not tracked in this repository. The current local runtime log reports the
anti-spoofing path as disabled.

If this project later bundles that code or its weights, include its Apache-2.0
license and verify the exact model files separately:

- Repository: <https://github.com/minivision-ai/Silent-Face-Anti-Spoofing>
- License: <https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/blob/master/LICENSE>

## Release checklist

Before publishing an `.exe`, `.dmg`, `.apk`, container, or hosted commercial
service:

1. Generate a dependency/model inventory from the actual release artifact.
2. Include this notice and the full upstream MIT/Apache license texts in the
   release's third-party licenses area.
3. Record the exact model filename, version, source URL, and SHA-256 hash.
4. Do not ship or auto-download `buffalo_s` for commercial use without written
   commercial authorization.
5. If the model is replaced, re-enroll face embeddings; embeddings from
   different recognition models are not interchangeable.

This file does not replace a full legal review of the final dependency tree,
model provenance, biometric-data obligations, or distribution terms.
