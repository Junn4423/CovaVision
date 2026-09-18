import {Buffer} from 'buffer';
import dgram from 'react-native-udp';
import type {
  AutoPairResult,
  DiscoveredServerOffer,
  QrPayload,
} from '../types/app';
import {normalizeApiBaseUrl, normalizeBaseUrl} from '../utils/url';

const DISCOVERY_PORT_FALLBACK = 45876;
const DISCOVERY_BROADCAST_HOST = '255.255.255.255';
const DISCOVERY_PACKET = JSON.stringify({
  type: 'facecheck.mobile.discover',
  schema: 'facecheck-mobile-discovery-v1',
  version: 1,
});

const globalScope = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

if (typeof globalScope.Buffer === 'undefined') {
  globalScope.Buffer = Buffer;
}

function readJsonSafe(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseUrlSafe(value: string): URL | null {
  try {
    return new URL(String(value || ''));
  } catch {
    return null;
  }
}

function extractHostFromBaseUrl(rawValue: string): string {
  const parsed = parseUrlSafe(String(rawValue || ''));
  return parsed?.hostname || '';
}

function isPrivateIpv4Host(host: string): boolean {
  const text = String(host || '').trim();
  const segments = text.split('.');
  if (segments.length !== 4 || segments.some(item => !/^\d+$/.test(item))) {
    return false;
  }

  const [a, b] = segments.map(item => Number(item));
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

function isLoopbackHost(host: string): boolean {
  const normalized = String(host || '').trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  );
}

function shouldOverrideConnectionHost(currentHost: string, targetHost: string): boolean {
  const normalizedCurrent = String(currentHost || '').trim().toLowerCase();
  const normalizedTarget = String(targetHost || '').trim().toLowerCase();
  if (!normalizedCurrent || !normalizedTarget || normalizedCurrent === normalizedTarget) {
    return false;
  }

  if (isLoopbackHost(normalizedCurrent)) {
    return true;
  }

  return (
    isPrivateIpv4Host(normalizedCurrent) &&
    isPrivateIpv4Host(normalizedTarget)
  );
}

function replaceBaseUrlHost(baseUrl: string, targetHost: string): string {
  const parsed = parseUrlSafe(baseUrl);
  if (!parsed) {
    return baseUrl;
  }

  const normalizedTarget = String(targetHost || '').trim();
  if (!normalizedTarget) {
    return baseUrl;
  }

  if (!shouldOverrideConnectionHost(parsed.hostname, normalizedTarget)) {
    return baseUrl;
  }

  const protocol = parsed.protocol || 'http:';
  const portText = parsed.port ? `:${parsed.port}` : '';
  const pathname = parsed.pathname || '';
  const search = parsed.search || '';
  const hash = parsed.hash || '';
  return `${protocol}//${normalizedTarget}${portText}${pathname}${search}${hash}`.replace(
    /\/+$/,
    '',
  );
}

function normalizeOffer(payload: any, sourceIp: string): DiscoveredServerOffer | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const type = String(payload.type || '').trim().toLowerCase();
  if (type !== 'facecheck.mobile.offer') {
    return null;
  }

  let apiBaseUrl = normalizeApiBaseUrl(String(payload.api_base_url || ''));
  if (!apiBaseUrl) {
    return null;
  }

  let webBaseUrl = normalizeBaseUrl(String(payload.web_base_url || ''));

  if (sourceIp) {
    try {
      const urlObj = new URL(apiBaseUrl);
      apiBaseUrl = `${urlObj.protocol}//${sourceIp}${urlObj.port ? `:${urlObj.port}` : ''}${urlObj.pathname}${urlObj.search}${urlObj.hash}`.replace(/\/+$/, '');
      
      if (webBaseUrl) {
        const webUrlObj = new URL(webBaseUrl);
        webBaseUrl = `${webUrlObj.protocol}//${sourceIp}${webUrlObj.port ? `:${webUrlObj.port}` : ''}${webUrlObj.pathname}${webUrlObj.search}${webUrlObj.hash}`.replace(/\/+$/, '');
      }
    } catch {
      // ignore
    }
  }

  const serverId = String(payload.server_id || '').trim();
  if (!serverId) {
    return null;
  }

  const pairVersion = Number(payload.pair_version) || 1;
  const discoveryPort = Number(payload.discovery_port) || DISCOVERY_PORT_FALLBACK;

  return {
    serverId,
    serverName: String(payload.server_name || 'FaceCheck').trim() || 'FaceCheck',
    pairVersion: Math.max(1, Math.trunc(pairVersion)),
    allowQrPairing: Boolean(payload.allow_qr_pairing),
    allowUdpDiscovery: Boolean(payload.allow_udp_discovery),
    apiBaseUrl,
    webBaseUrl: webBaseUrl || undefined,
    pairEndpoint: String(payload.pair_endpoint || '/api/mobile_config/pair'),
    discoveryPort: Math.max(1, Math.min(65535, Math.trunc(discoveryPort))),
    sourceIp: sourceIp || '',
    receivedAt: new Date().toISOString(),
  };
}

function mergeDiscoveryOffer(currentList: DiscoveredServerOffer[], offer: DiscoveredServerOffer) {
  const key = `${offer.serverId}|${offer.apiBaseUrl}|${offer.sourceIp}`;
  const next = currentList.filter(
    item => `${item.serverId}|${item.apiBaseUrl}|${item.sourceIp}` !== key,
  );
  next.push(offer);
  next.sort((a, b) => {
    const nameCompare = a.serverName.localeCompare(b.serverName);
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return a.apiBaseUrl.localeCompare(b.apiBaseUrl);
  });
  return next;
}

function formatFetchError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Không thể kết nối tới server pairing.';
}

export function parseQrPayloadText(rawValue: string): QrPayload | null {
  const value = String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  const payload = readJsonSafe(value);
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (String(payload.schema || '').trim() !== 'facecheck-mobile-pairing-v1') {
    return null;
  }

  const serverId = String(payload.server_id || '').trim();
  const pairingCode = String(payload.pairing_code || '').trim().toUpperCase();
  const apiBaseUrl = normalizeApiBaseUrl(String(payload.api_base_url || ''));
  const webBaseUrl = normalizeBaseUrl(String(payload.web_base_url || ''));
  const pairVersion = Number(payload.pair_version) || 1;

  if (!serverId || !pairingCode || !apiBaseUrl) {
    return null;
  }

  return {
    schema: 'facecheck-mobile-pairing-v1',
    server_id: serverId,
    pair_version: Math.max(1, Math.trunc(pairVersion)),
    pairing_code: pairingCode,
    api_base_url: apiBaseUrl,
    web_base_url: webBaseUrl || undefined,
  };
}

export function isPublicQrPayload(payload: QrPayload | null): boolean {
  if (!payload) {
    return false;
  }

  const host = extractHostFromBaseUrl(payload.api_base_url);
  if (!host || isLoopbackHost(host) || isPrivateIpv4Host(host)) {
    return false;
  }
  return true;
}

export async function discoverMobileServers(options?: {
  timeoutMs?: number;
  discoveryPort?: number;
}): Promise<DiscoveredServerOffer[]> {
  const timeoutMs = Math.max(300, Number(options?.timeoutMs) || 1500);
  const discoveryPort = Math.max(1, Number(options?.discoveryPort) || DISCOVERY_PORT_FALLBACK);

  return new Promise(resolve => {
    const socket = dgram.createSocket({type: 'udp4'});
    const outgoing = Buffer.from(DISCOVERY_PACKET, 'utf8');
    let offers: DiscoveredServerOffer[] = [];
    let completed = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    function finish() {
      if (completed) {
        return;
      }
      completed = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      try {
        socket.close();
      } catch {
        // ignore close errors
      }
      resolve(offers);
    }

    socket.on('message', (message: any, remoteInfo: any) => {
      try {
        const rawText =
          typeof message === 'string'
            ? message
            : Buffer.from(message).toString('utf8');
        const parsed = readJsonSafe(rawText);
        const normalized = normalizeOffer(parsed, String(remoteInfo?.address || ''));
        if (!normalized) {
          return;
        }
        offers = mergeDiscoveryOffer(offers, normalized);
      } catch {
        // ignore malformed packet
      }
    });

    socket.on('error', () => {
      finish();
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        // ignore broadcast setup errors
      }
      try {
        socket.send(outgoing, 0, outgoing.length, discoveryPort, DISCOVERY_BROADCAST_HOST);
      } catch {
        finish();
      }
    });

    timeoutHandle = setTimeout(finish, timeoutMs);
  });
}

type PairPayload = {
  pairingCode: string;
  targetHost?: string;
};

export async function pairWithDiscoveredServer(
  offer: DiscoveredServerOffer,
  payload: PairPayload,
): Promise<AutoPairResult> {
  const endpointPath = offer.pairEndpoint || '/api/mobile_config/pair';
  const endpoint = `${offer.apiBaseUrl}${
    endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`
  }`;
  return pairWithEndpoint(endpoint, {
    pairingCode: payload.pairingCode,
    serverId: offer.serverId,
    targetHost:
      payload.targetHost || offer.sourceIp || extractHostFromBaseUrl(offer.apiBaseUrl),
  });
}

export async function pairWithQrPayload(
  qrPayload: QrPayload,
  options?: {targetHost?: string; pairingCode?: string},
): Promise<AutoPairResult> {
  const endpoint = `${normalizeApiBaseUrl(qrPayload.api_base_url)}/api/mobile_config/pair`;
  return pairWithEndpoint(endpoint, {
    pairingCode: options?.pairingCode || qrPayload.pairing_code,
    serverId: qrPayload.server_id,
    targetHost:
      options?.targetHost ||
      extractHostFromBaseUrl(qrPayload.api_base_url),
  });
}

async function pairWithEndpoint(
  endpoint: string,
  options: {
    pairingCode?: string;
    serverId?: string;
    targetHost?: string;
  },
): Promise<AutoPairResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, 15000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        pairing_code: options.pairingCode || '',
        server_id: options.serverId || '',
        target_host: options.targetHost || '',
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Pairing bi timeout khi ket noi ${endpoint}. Kiem tra LAN hoac firewall roi thu lai.`,
      );
    }
    throw new Error(formatFetchError(error));
  } finally {
    clearTimeout(timeoutHandle);
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || `Pairing that bai (HTTP ${response.status}).`);
  }

  const connection = payload.connection || {};
  const endpointHost = extractHostFromBaseUrl(endpoint);
  const targetHost = String(options.targetHost || '').trim() || endpointHost;

  const connectionApiBaseRaw =
    String(connection.api_base_url || '').trim() ||
    String(connection.web_base_url || '').trim() ||
    endpoint.replace(/\/api\/mobile_config\/pair$/i, '');
  const normalizedApiBase = normalizeApiBaseUrl(
    replaceBaseUrlHost(connectionApiBaseRaw, targetHost),
  );
  if (!normalizedApiBase) {
    throw new Error('Server pair thanh cong nhung response API base URL khong hop le.');
  }

  return {
    message: String(payload.message || 'Pairing thanh cong.'),
    connection: {
      label: String(connection.label || 'FaceCheck').trim() || 'FaceCheck',
      apiBaseUrl: normalizedApiBase,
      webBaseUrl: normalizeBaseUrl(
        replaceBaseUrlHost(String(connection.web_base_url || ''), targetHost),
      ) || undefined,
      serverId: String(connection.server_id || '').trim() || undefined,
      pairVersion: Number(connection.pair_version) || undefined,
      pairingMethod: String(connection.pairing_method || '').trim() || undefined,
    },
  };
}
