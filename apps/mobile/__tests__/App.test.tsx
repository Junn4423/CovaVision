/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.setTimeout(15000);

jest.mock('../src/services/mobileAutoConfigService', () => ({
  discoverMobileServers: jest.fn().mockResolvedValue([]),
  pairWithDiscoveredServer: jest.fn(),
  pairWithQrPayload: jest.fn(),
  parseQrPayloadText: jest.fn(() => null),
  isPublicQrPayload: jest.fn(() => false),
}));

jest.mock('../src/services/nativeLocalAttendance', () => ({
  initializeMobileLocalDataStore: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/connectionStorage', () => ({
  loadConnectionConfig: jest.fn().mockResolvedValue(null),
  saveConnectionConfig: jest.fn(),
}));

jest.mock('../src/services/connectionHealth', () => ({
  checkConnectionHealth: jest.fn().mockResolvedValue({
    ok: false,
    apiBaseUrl: '',
    checkedAt: '',
    message: '',
    apiStatus: 'unknown',
  }),
}));

test('renders correctly', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;

  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    tree?.unmount();
  });
});
