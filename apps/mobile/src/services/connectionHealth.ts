import type {ConnectionConfig, ConnectionHealth} from '../types/app';
import {resolveApiBaseUrl, resolveEndpointUrl} from '../utils/url';

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Không thể kết nối tới hệ thống.';
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function readJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function checkConnectionHealth(
  config: ConnectionConfig,
): Promise<ConnectionHealth> {
  const apiBaseUrl = resolveApiBaseUrl(config);
  const result: ConnectionHealth = {
    ok: false,
    apiBaseUrl,
    checkedAt: new Date().toISOString(),
    message: '',
    apiStatus: 'pending',
  };

  try {
    const apiResponse = await fetchWithTimeout(
      resolveEndpointUrl(apiBaseUrl, '/health'),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      4500,
    );
    const payload = await readJsonSafe(apiResponse);
    result.apiStatus =
      apiResponse.ok && payload?.status === 'ok'
        ? 'ok'
        : payload?.message || `HTTP ${apiResponse.status}`;
  } catch (error) {
    result.apiStatus = formatErrorMessage(error);
  }

  result.ok = result.apiStatus === 'ok';
  result.message = result.ok
    ? 'Hệ thống sẵn sàng.'
    : `Hệ thống lỗi: ${result.apiStatus}.`;

  return result;
}
