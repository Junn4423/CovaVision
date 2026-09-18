import {api, clearAuthState, setApiBaseUrl, setSessionToken} from '../src/services/api';
import {resolveEndpointUrl} from '../src/utils/url';

describe('CovaVision mobile transport', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearAuthState();
    setApiBaseUrl('');
  });

  test('resolves ordinary API paths without PHP gateway rewriting', () => {
    expect(resolveEndpointUrl('https://api.example.com', '/api/v1/cameras')).toBe(
      'https://api.example.com/api/v1/cameras',
    );
  });

  test('uses bearer auth and does not return camera connection details to the app', async () => {
    setApiBaseUrl('https://api.example.com');
    setSessionToken('mobile-token');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        cameras: [{id: 'cam-front', name: 'Cổng chính'}],
      }),
    } as Response);

    const response = await api.getCameras();
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/api/v1/cameras');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({Authorization: 'Bearer mobile-token'}),
    });
    // This is the server contract: the client must only render safe metadata.
    expect(response.cameras[0].id).toBe('cam-front');
    expect(response.cameras[0]).toEqual({id: 'cam-front', name: 'Cổng chính'});
  });

  test('requests snapshots by opaque camera id through the backend', async () => {
    setApiBaseUrl('https://api.example.com');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({success: true, image_base64: 'data:image/jpeg;base64,abc'}),
    } as Response);

    await api.cameraSnapshot('cam-front');
    expect(String((globalThis.fetch as jest.Mock).mock.calls[0][0])).toBe(
      'https://api.example.com/api/v1/cameras/snapshot?camera_id=cam-front',
    );
  });
});
