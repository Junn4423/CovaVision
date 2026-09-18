import SQLite from 'react-native-sqlite-storage';
import { clearAuthState, setAuthData } from '../src/services/api';
import { initializeMobileLocalDataStore } from '../src/services/mobileLocalData';

describe('mobile local data isolation', () => {
  afterEach(() => {
    clearAuthState();
  });

  test('opens a separate SQLite database for each configured tenant', async () => {
    const openDatabase = SQLite.openDatabase as jest.Mock;
    openDatabase.mockClear();

    setAuthData({ database: 'company_a_database' });
    await initializeMobileLocalDataStore();

    setAuthData({ database: 'company_b_database' });
    await initializeMobileLocalDataStore();

    setAuthData({ database: 'company_a_database' });
    await initializeMobileLocalDataStore();

    expect(openDatabase).toHaveBeenCalledTimes(2);
    const firstName = openDatabase.mock.calls[0][0].name;
    const secondName = openDatabase.mock.calls[1][0].name;
    expect(firstName).toContain('company_a_database');
    expect(secondName).toContain('company_b_database');
    expect(firstName).not.toBe(secondName);
  });
});
