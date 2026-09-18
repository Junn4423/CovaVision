const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const { speakToCamera } = require('./cameraSpeakerClient');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_FRAME_TIMEOUT_MS = 500;
const FFMPEG_START_TIMEOUT_MS = 8000;
const FFMPEG_OUTPUT_WIDTH = 768;

// Run 4 concurrent pipelined snapshot workers for 18-25 FPS throughput
const MAX_SNAPSHOT_WORKERS = 4;

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8, rejectUnauthorized: false });

const DEFAULT_SNAPSHOT_PATHS = [
  '/ISAPI/Streaming/channels/102/picture',
  '/ISAPI/Streaming/channels/101/picture',
  '/onvif/snapshot?Profile_2',
  '/onvif/snapshot?Profile_1',
  '/Streaming/channels/1/picture',
  '/cgi-bin/snapshot.cgi?channel=1',
  '/cgi-bin/snapshot.cgi',
];

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function parseAuthHeader(header) {
  const match = String(header || '').match(/^Digest\s+(.+)$/i);
  if (!match) return null;

  const values = {};
  for (const part of match[1].matchAll(/([a-z]+)=(?:"([^"]*)"|([^,\s]+))/gi)) {
    values[part[1].toLowerCase()] = part[2] ?? part[3] ?? '';
  }
  return values.realm && values.nonce ? values : null;
}

function buildDigestAuthorization({ challenge, username, password, method, uri }) {
  const qopValues = String(challenge.qop || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const qop = qopValues.includes('auth') ? 'auth' : '';
  challenge.nc = (Number(challenge.nc) || 0) + 1;
  const nc = String(challenge.nc).padStart(8, '0');
  const cnonce = challenge.cnonce || crypto.randomBytes(12).toString('hex');
  challenge.cnonce = cnonce;
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const fields = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.algorithm) fields.push(`algorithm=${challenge.algorithm}`);
  if (qop) fields.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (challenge.opaque) fields.push(`opaque="${challenge.opaque}"`);
  return `Digest ${fields.join(', ')}`;
}

function requestBuffer(target, options = {}) {
  const url = new URL(target);
  const transport = url.protocol === 'https:' ? https : http;
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout,
      agent: options.agent || (url.protocol === 'https:' ? httpsAgent : httpAgent),
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });

    request.on('timeout', () => request.destroy(new Error('Camera snapshot timeout')));
    request.on('error', reject);
    request.end();
  });
}

async function requestAuthenticatedImage(target, credentials, timeout, authState = {}) {
  const url = new URL(target);
  const uri = `${url.pathname}${url.search}` || '/';

  if (authState.challenge || authState.authorization) {
    let authorization = authState.authorization;
    if (authState.challenge) {
      authorization = buildDigestAuthorization({
        challenge: authState.challenge,
        username: credentials.username,
        password: credentials.password,
        method: 'GET',
        uri,
      });
    }
    const authenticated = await requestBuffer(target, {
      timeout,
      headers: { Authorization: authorization },
    });
    if (authenticated.status === 200 && authenticated.body.length > 0) return authenticated;
    if (authenticated.status !== 401) return authenticated;
    authState.challenge = null;
    authState.authorization = null;
  }

  const first = await requestBuffer(target, { timeout });
  if (first.status === 200 && first.body.length > 0) return first;
  if (first.status !== 401 || !credentials.username) return first;

  const challengeHeader = first.headers['www-authenticate'];
  const challengeText = Array.isArray(challengeHeader) ? challengeHeader[0] : challengeHeader;
  const digest = parseAuthHeader(challengeText);

  let authorization = '';
  if (digest) {
    authState.challenge = digest;
    authorization = buildDigestAuthorization({
      challenge: authState.challenge,
      username: credentials.username,
      password: credentials.password,
      method: 'GET',
      uri,
    });
  } else if (/^Basic\b/i.test(String(challengeText || ''))) {
    authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
    authState.authorization = authorization;
  }

  if (!authorization) return first;
  return requestBuffer(target, {
    timeout,
    headers: { Authorization: authorization },
  });
}

function resolveSnapshotTargets(rtspUrl, cameraOptions = {}) {
  let parsed;
  try {
    parsed = new URL(String(rtspUrl || '').trim());
  } catch {
    return [];
  }

  if (!parsed.hostname) return [];
  const snapshotPath = String(cameraOptions.snapshot_path || '').trim();
  const paths = snapshotPath ? [snapshotPath, ...DEFAULT_SNAPSHOT_PATHS] : DEFAULT_SNAPSHOT_PATHS;
  const httpPort = Number(cameraOptions.snapshot_http_port || 80);
  const protocol = String(cameraOptions.snapshot_protocol || 'http').toLowerCase() === 'https'
    ? 'https'
    : 'http';
  const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname;
  const port = httpPort === 80 && protocol === 'http' ? '' : `:${httpPort}`;

  return [...new Set(paths.map(path => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${protocol}://${host}${port}${normalizedPath}`;
  }))];
}

function isJpeg(response) {
  return response.status === 200
    && response.body.length >= 2
    && response.body[0] === 0xff
    && response.body[1] === 0xd8;
}

function resolveFfmpegPath() {
  try {
    return require('@ffmpeg-installer/ffmpeg').path || '';
  } catch {
    return '';
  }
}

/**
 * High-performance, ultra-low-latency RTSP bridge for desktop Electron.
 *
 * Latency optimization features:
 * 1. Embedded HTTP server serving /live.mjpg (multipart/x-mixed-replace) directly
 *    on 127.0.0.1. Chromium renders MJPEG natively with zero Base64 or IPC overhead.
 * 2. Drop-late-frames socket backpressure: if a client's socket is still flushing
 *    data (writableLength > 0), incoming frames are DROPPED immediately so the
 *    browser does not accumulate an ever-growing display queue.
 * 3. FFmpeg decodes the camera's native H.265 RTSP stream and emits resized JPEG frames.
 * 4. Strict sequence checking on snapshot polling: out-of-order frames from camera
 *    are discarded; request pacing prevents camera internal HTTP queue backlog.
 */
class LocalRtspBridge {
  constructor() {
    this.active = null;
    this.lastFrame = null;
    this.lastImageBase64 = null;
    this.lastFrameAt = 0;
    this.workers = [];
    this.frameSeq = 0;
    this.requestSeq = 0;
    this.lastDeliveredSeq = 0;
    this.ffmpegProcess = null;
    this.onFrame = null;

    // Embedded HTTP MJPEG server
    this.httpServer = null;
    this.httpPort = 0;
    this.mjpegClients = new Set();
  }

  async ensureHttpServer() {
    if (this.httpServer && this.httpPort) return this.httpPort;

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

        // CORS headers for all responses
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (url.pathname === '/live.mjpg') {
          res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'close',
            'Pragma': 'no-cache',
          });
          if (typeof res.flushHeaders === 'function') res.flushHeaders();

          // If a frame is already available, write it immediately so <img> has visual feedback
          if (this.lastFrame && this.lastFrame.length > 0) {
            res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${this.lastFrame.length}\r\n\r\n`);
            res.write(this.lastFrame);
            res.write('\r\n');
          }

          this.mjpegClients.add(res);
          req.on('close', () => {
            this.mjpegClients.delete(res);
          });
          return;
        }

        if (url.pathname === '/snapshot.jpg') {
          if (this.lastFrame && this.lastFrame.length > 0) {
            res.writeHead(200, {
              'Content-Type': 'image/jpeg',
              'Content-Length': this.lastFrame.length,
              'Cache-Control': 'no-cache, no-store',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(this.lastFrame);
          } else {
            res.writeHead(503, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Chưa có khung hình');
          }
          return;
        }

        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }

        if (req.method === 'POST' && (url.pathname === '/api/speaker/speak' || url.pathname === '/api/speaker/test')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const result = await speakToCamera(payload);
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(500, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(JSON.stringify({ success: false, message: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('Not found');
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        this.httpPort = addr.port;
        this.httpServer = server;
        resolve(this.httpPort);
      });

      server.on('error', reject);
    });
  }

  stopFfmpeg() {
    const process = this.ffmpegProcess;
    this.ffmpegProcess = null;
    if (!process || process.killed) return;
    try {
      process.kill('SIGTERM');
    } catch {
      // already exited
    }
  }

  stopCaptureLoop() {
    for (const worker of this.workers) {
      worker.cancelled = true;
      if (worker.timer) {
        clearTimeout(worker.timer);
        worker.timer = null;
      }
    }
    this.workers = [];
  }

  /**
   * Broadcasts a JPEG frame directly to all connected MJPEG HTTP clients.
   *
   * ZERO-LATENCY KEY MECHANISM:
   * If a client's socket is still flushing data (client.writableLength > 0),
   * this frame is SKIPPED for that client. That prevents frames from queuing up
   * inside the TCP/Node buffer, guaranteeing that the browser ALWAYS displays
   * the newest real-time frame without latency accumulation!
   */
  _broadcastFrame(buffer) {
    if (!buffer || buffer.length === 0) return;

    this.frameSeq += 1;
    this.lastFrame = buffer;
    this.lastImageBase64 = null; // Lazy base64: only encode on explicit snapshot() call
    this.lastFrameAt = Date.now();

    // Notify Electron main process for real-time FPS counter update
    if (this.onFrame) {
      this.onFrame();
    }

    if (this.mjpegClients.size === 0) return;

    const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`;
    for (const client of this.mjpegClients) {
      if (client.writable) {
        // Drop late frame if backpressure exists
        if (client.writableLength > 0) {
          continue;
        }
        client.write(header);
        client.write(buffer);
        client.write('\r\n');
      }
    }
  }

  startFfmpeg(rtspUrl, cameraOptions = {}) {
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      return Promise.resolve({ success: false, message: 'FFmpeg chưa được cài trong desktop app.' });
    }

    const outputWidth = Math.min(
      960,
      Math.max(320, Number(cameraOptions.preview_width) || FFMPEG_OUTPUT_WIDTH),
    );

    // Keep the RTSP options conservative. This EZVIZ H.265 stream stops producing
    // frames when nobuffer/low_delay/analyzeduration=0 are forced, which triggers
    // the much slower HTTP snapshot fallback.
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-rtsp_transport', 'tcp',
      '-stimeout', '3000000',
      '-i', rtspUrl,
      '-an',
      '-vf', `scale=${outputWidth}:-2`,
      '-q:v', '5',
      '-f', 'mjpeg',
      'pipe:1',
    ];

    let child;
    try {
      child = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
    } catch (error) {
      return Promise.resolve({ success: false, message: error?.message || 'Không khởi động được FFmpeg.' });
    }

    this.ffmpegProcess = child;
    let frameBuffer = Buffer.alloc(0);
    let settled = false;
    let timer = null;

    return new Promise(resolve => {
      const fail = message => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (this.ffmpegProcess === child) this.ffmpegProcess = null;
        try { child.kill('SIGTERM'); } catch { /* already exited */ }
        resolve({ success: false, message });
      };

      const handleChunk = chunk => {
        frameBuffer = Buffer.concat([frameBuffer, chunk]);
        let newestFrame = null;

        while (frameBuffer.length > 0) {
          const start = frameBuffer.indexOf(Buffer.from([0xff, 0xd8]));
          if (start < 0) {
            frameBuffer = frameBuffer.subarray(Math.max(0, frameBuffer.length - 1));
            return;
          }
          const end = frameBuffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
          if (end < 0) {
            if (start > 0) frameBuffer = frameBuffer.subarray(start);
            return;
          }
          const frame = Buffer.from(frameBuffer.subarray(start, end + 2));
          frameBuffer = frameBuffer.subarray(end + 2);
          newestFrame = frame;
        }

        // If chunk contains multiple frames (burst), only broadcast the newest one!
        if (newestFrame) {
          this._broadcastFrame(newestFrame);
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            resolve({
              success: true,
              message: 'Đã mở luồng RTSP trực tiếp bằng FFmpeg (Zero-Latency).',
              stream_url: `http://127.0.0.1:${this.httpPort}/live.mjpg`,
              mode: 'ffmpeg',
            });
          }
        }
      };

      child.stdout.on('data', handleChunk);
      child.once('error', error => fail(error?.message || 'Không khởi động được FFmpeg.'));
      child.once('exit', code => {
        if (!settled) {
          fail(code ? `FFmpeg không mở được luồng RTSP (mã ${code}).` : 'Luồng RTSP đã dừng trước khi có khung hình.');
        } else if (this.ffmpegProcess === child) {
          this.ffmpegProcess = null;
          if (this.active?.mode === 'ffmpeg') this.active = null;
        }
      });
      timer = setTimeout(() => fail('FFmpeg không nhận được khung hình RTSP trong thời gian cho phép.'), FFMPEG_START_TIMEOUT_MS);
    });
  }

  /**
   * Paced, sequence-guarded snapshot capture loop.
   *
   * Designed specifically for EZVIZ cameras:
   * 1. Limits concurrent workers to 2 to prevent EZVIZ internal queue build-up.
   * 2. Strict sequence checking: if Worker 1 finishes after Worker 2, Worker 1's
   *    frame is discarded because it is older than what is already on screen.
   * 3. 15ms pacing between requests ensures the camera's hardware snapshot encoder
   *    is idle when the request hits, guaranteeing a fresh live sensor frame.
   */
  scheduleCapture() {
    this.stopCaptureLoop();

    this.requestSeq = 0;
    this.lastDeliveredSeq = 0;

    const workerCount = Math.max(1, Math.min(MAX_SNAPSHOT_WORKERS, 5));

    for (let i = 0; i < workerCount; i++) {
      const worker = { cancelled: false, timer: null, id: i };
      this.workers.push(worker);

      // Stagger worker initial starts evenly (e.g. 0ms, 20ms, 40ms, 60ms)
      const staggerMs = Math.round((i / workerCount) * 80);

      const runWorker = async () => {
        if (worker.cancelled || !this.active) return;

        const workerAuth = {};
        if (this.active.authState.authorization) {
          workerAuth.authorization = this.active.authState.authorization;
        }
        if (this.active.authState.challenge) {
          workerAuth.challenge = { ...this.active.authState.challenge };
        }

        const seq = ++this.requestSeq;
        let gotFrame = false;

        try {
          const response = await requestAuthenticatedImage(
            this.active.target,
            this.active.credentials,
            this.active.timeout,
            workerAuth,
          );

          if (worker.cancelled || !this.active) return;

          // Strictly drop out-of-order frames: only show frames newer than current
          if (isJpeg(response) && seq > this.lastDeliveredSeq) {
            this.lastDeliveredSeq = seq;
            this._broadcastFrame(response.body);

            if (workerAuth.challenge) {
              this.active.authState.challenge = workerAuth.challenge;
            }
            if (workerAuth.authorization) {
              this.active.authState.authorization = workerAuth.authorization;
            }
            gotFrame = true;
          }
        } catch {
          // Retry on next cycle
        }

        if (!worker.cancelled && this.active) {
          // Re-fetch immediately (0ms) upon success for high FPS (18-25fps); short backoff on error
          const nextDelay = gotFrame ? 0 : 50;
          worker.timer = setTimeout(runWorker, nextDelay);
        }
      };

      worker.timer = setTimeout(runWorker, staggerMs);
    }
  }

  async start(payload = {}) {
    const rtspUrl = String(payload.rtsp_url || payload.source || '').trim();
    if (!rtspUrl) return { success: false, message: 'Camera RTSP chưa có địa chỉ nguồn.' };

    this.stop();
    await this.ensureHttpServer();

    let parsed;
    try {
      parsed = new URL(rtspUrl);
    } catch {
      return { success: false, message: 'Địa chỉ RTSP không hợp lệ.' };
    }

    const credentials = {
      username: decodeURIComponent(parsed.username || payload.username || ''),
      password: decodeURIComponent(parsed.password || payload.password || ''),
    };
    const cameraOptions = payload.camera_options && typeof payload.camera_options === 'object'
      ? payload.camera_options
      : {};

    // 1. Try native zero-latency FFmpeg RTSP streaming first
    const ffmpegResult = await this.startFfmpeg(rtspUrl, cameraOptions);
    if (ffmpegResult.success) {
      this.active = { mode: 'ffmpeg', rtspUrl, target: rtspUrl };
      return {
        success: true,
        message: 'Đã mở luồng RTSP trực tiếp bằng FFmpeg (Zero-Latency).',
        mode: 'ffmpeg',
        stream_url: `http://127.0.0.1:${this.httpPort}/live.mjpg`,
      };
    }

    // 2. Fallback to optimized HTTP snapshot poller
    this.lastFrame = null;
    this.lastImageBase64 = null;
    this.lastFrameAt = 0;
    const targets = resolveSnapshotTargets(rtspUrl, cameraOptions);
    const openTimeout = Number(cameraOptions.open_timeout_ms) > 0
      ? Math.min(Number(cameraOptions.open_timeout_ms), DEFAULT_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;
    const frameTimeout = Number(cameraOptions.snapshot_timeout_ms) > 0
      ? Math.min(Number(cameraOptions.snapshot_timeout_ms), 1000)
      : DEFAULT_FRAME_TIMEOUT_MS;

    const deadline = Date.now() + Math.min(openTimeout * targets.length, 6000);
    for (const target of targets) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        const authState = {};
        const response = await requestAuthenticatedImage(
          target,
          credentials,
          Math.min(openTimeout, Math.max(500, remaining)),
          authState,
        );
        if (!isJpeg(response)) continue;
        this.active = {
          rtspUrl,
          credentials,
          target,
          timeout: frameTimeout,
          authState,
          mode: 'snapshot',
        };
        this._broadcastFrame(response.body);
        this.scheduleCapture();
        return {
          success: true,
          message: 'Đã kết nối camera LAN (Snapshot tối ưu độ trễ thấp).',
          mode: 'snapshot',
          stream_url: `http://127.0.0.1:${this.httpPort}/live.mjpg`,
        };
      } catch {
        // Try next snapshot target
      }
    }

    this.active = null;
    this.lastFrame = null;
    this.lastImageBase64 = null;
    this.lastFrameAt = 0;
    return {
      success: false,
      message: 'Không đọc được luồng RTSP hoặc snapshot từ camera. Kiểm tra IP camera, tài khoản hoặc mạng LAN.',
    };
  }

  async snapshot() {
    if (!this.active) return { success: false, message: 'Camera desktop chưa bật.' };
    if (!this.lastFrame || this.lastFrame.length === 0) {
      return { success: false, message: 'Đang chờ khung hình đầu tiên từ camera.' };
    }
    if (!this.lastImageBase64) {
      this.lastImageBase64 = `data:image/jpeg;base64,${this.lastFrame.toString('base64')}`;
    }
    return {
      success: true,
      image_base64: this.lastImageBase64,
      timestamp: this.lastFrameAt,
    };
  }

  stop() {
    this.stopCaptureLoop();
    this.stopFfmpeg();

    for (const client of this.mjpegClients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.mjpegClients.clear();

    this.active = null;
    this.lastFrame = null;
    this.lastImageBase64 = null;
    this.lastFrameAt = 0;
    this.frameSeq = 0;
    this.requestSeq = 0;
    this.lastDeliveredSeq = 0;
    return { success: true, message: 'Đã tắt camera desktop.' };
  }

  status() {
    return {
      success: true,
      running: Boolean(this.active),
      mode: this.active?.mode || '',
      stream_url: this.active && this.httpPort ? `http://127.0.0.1:${this.httpPort}/live.mjpg` : '',
    };
  }
}

module.exports = { LocalRtspBridge };
