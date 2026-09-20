// Native/mobile-only attendance cache. This module is the boundary for data
// the app can own locally without asking the server on every screen render.
export {
  clearMobileLocalData,
  deleteLocalEmployee,
  deleteMobileAttendanceRecord,
  exportMobileLocalDataSnapshot,
  getLocalAccounts,
  getLocalAccountsPage,
  getLocalAttendanceForEmployeeRange,
  getLocalAttendanceRange,
  getLocalAttendanceForEmployee,
  getLocalEmployees,
  getLocalEmployeesPage,
  getLocalTodayAttendance,
  getLocalTodayAttendancePage,
  getMobileLocalDataSummary,
  initializeMobileLocalDataStore,
  recordMobileServerAttendanceResponse,
  recordMobileLocalFaceAttendance,
  syncAllMobileLocalData,
  syncMobileAccountsFromServer,
  syncMobileEmployeesFromServer,
  syncMobileTodayAttendanceFromServer,
  upsertMobileAttendanceRecords,
  type MobileLocalDataPage,
  type MobileLocalDataSummary,
} from './mobileLocalData';

export {
  clearOfflineAttendanceQueue,
  enqueueOfflineAttendance,
  getOfflineAttendanceQueue,
  syncOfflineAttendanceQueue,
  type OfflineAttendanceInput,
  type OfflineAttendanceItem,
  type OfflineAttendanceSyncResult,
} from './offlineAttendanceQueue';
