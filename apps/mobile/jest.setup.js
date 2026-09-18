/* eslint-env jest */

jest.mock(
  '@react-native-async-storage/async-storage',
  () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-udp', () => ({
  createSocket: () => ({
    bind: (_port, callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    },
    close: () => {},
    send: () => {},
    setBroadcast: () => {},
    on: () => {},
  }),
}));

jest.mock('react-native-tts', () => ({
  __esModule: true,
  default: {
    getInitStatus: jest.fn().mockResolvedValue(undefined),
    setDefaultLanguage: jest.fn().mockResolvedValue(undefined),
    setDefaultRate: jest.fn(),
    setDefaultPitch: jest.fn(),
    speak: jest.fn(),
    stop: jest.fn(),
  },
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DownloadDirectoryPath: '/tmp',
    DocumentDirectoryPath: '/tmp',
    TemporaryDirectoryPath: '/tmp',
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
  DownloadDirectoryPath: '/tmp',
  DocumentDirectoryPath: '/tmp',
  TemporaryDirectoryPath: '/tmp',
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: jest.fn(() => ({})),
    book_new: jest.fn(() => ({})),
    book_append_sheet: jest.fn(),
  },
  write: jest.fn(() => ''),
}));

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    addFileToVFS: jest.fn(),
    addFont: jest.fn(),
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    text: jest.fn(),
    output: jest.fn(() => 'data:application/pdf;base64,'),
    internal: {
      pageSize: {
        getWidth: jest.fn(() => 210),
      },
    },
  })),
}));

jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('react-native-camera-kit', () => {
  const React = require('react');
  const {View} = require('react-native');

  return {
    __esModule: true,
    default: {
      requestDeviceCameraAuthorization: jest.fn().mockResolvedValue(true),
      checkDeviceCameraAuthorizationStatus: jest.fn().mockResolvedValue(true),
    },
    CameraType: {
      Back: 'back',
      Front: 'front',
    },
    Camera: React.forwardRef((props, _ref) =>
      React.createElement(View, props, props.children),
    ),
  };
});

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const React = require('react');
  const {Text} = require('react-native');

  return function MockMaterialCommunityIcons(props) {
    return React.createElement(Text, props, props.name || 'icon');
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const {View} = require('react-native');

  return {
    SafeAreaProvider: ({children}) => React.createElement(View, null, children),
    SafeAreaView: ({children}) => React.createElement(View, null, children),
    useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
  };
});

jest.mock('react-native-sqlite-storage', () => {
  const createResult = rows => ({
    insertId: 0,
    rowsAffected: 0,
    rows: {
      length: rows.length,
      item: index => rows[index],
    },
  });

  return {
    __esModule: true,
    default: {
      enablePromise: jest.fn(),
      openDatabase: jest.fn().mockResolvedValue({
        executeSql: jest.fn().mockResolvedValue([createResult([])]),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      deleteDatabase: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const {NativeModules} = require('react-native');

NativeModules.ScreenBrightness = {
  setTemporaryBrightness: jest.fn().mockResolvedValue(true),
  restoreSystemBrightness: jest.fn().mockResolvedValue(true),
};
