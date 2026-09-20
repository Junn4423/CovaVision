import {checkConnectionHealth} from '../src/services/connectionHealth';

describe('mobile backend health contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('calls the backend health route without a legacy /api prefix', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({status: 'ok'}),
    } as Response);

    const result = await checkConnectionHealth({apiBaseUrl: 'https://api.example.com'} as any);

    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/health');
  });
});
