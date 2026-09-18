# Mobile service boundaries

Mobile native should be independent from the desktop UI, but it still uses the
same backend API as web for shared business logic.

- `api/`: HTTP calls to the backend API shared with web.
- `api/faceRecognition.ts`: backend-required face recognition and attendance
  writes. Keep these server-side because they need shared face embeddings,
  cooldown rules, and attendance state.
- `nativeLocalAttendance.ts`: native/local SQLite attendance cache and sync
  helpers. UI can use this without treating it as a server API.
- `request.ts`: runtime API base URL, session token, and common request headers.
