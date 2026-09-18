import SQLite, {
  type SQLiteDatabase,
  type SQLiteResultSet,
} from 'react-native-sqlite-storage';
import { api, getAuthData } from './api';

SQLite.enablePromise(true);

const MOBILE_DB_PREFIX = 'covavision_mobile';
const MOBILE_DB_LOCATION = 'default';
const META_LAST_EMPLOYEE_SYNC = 'last_employee_sync_at';
const META_LAST_ACCOUNT_SYNC = 'last_account_sync_at';
const META_LAST_ATTENDANCE_SYNC = 'last_attendance_sync_at';
const META_LAST_FULL_SYNC = 'last_full_sync_at';

const databasePromises = new Map<string, Promise<SQLiteDatabase>>();
const LOCAL_IMAGE_CACHE = new Map<string, string>();

export function setCachedEmployeeImageUri(employeeId: string, uri: string): void {
  if (!employeeId || !uri) return;
  LOCAL_IMAGE_CACHE.set(String(employeeId).trim(), uri);
}

export function getCachedEmployeeImageUri(employeeId: string): string {
  if (!employeeId) return '';
  return LOCAL_IMAGE_CACHE.get(String(employeeId).trim()) || '';
}

function hashTenantKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getActiveTenantKey(): string {
  const auth = getAuthData() || {};
  return normalizeText(
    auth.database || auth.dbName || auth.table,
  ).toLowerCase();
}

function getActiveDatabaseName(): string {
  const tenantKey = getActiveTenantKey();
  if (!tenantKey) {
    return `${MOBILE_DB_PREFIX}_anonymous.db`;
  }
  const readable =
    tenantKey.replace(/[^a-z0-9_]+/g, '_').slice(0, 36) || 'tenant';
  return `${MOBILE_DB_PREFIX}_${readable}_${hashTenantKey(tenantKey)}.db`;
}

export type MobileLocalDataSummary = {
  databaseName: string;
  employeesCount: number;
  accountsCount: number;
  attendanceCount: number;
  lastEmployeeSyncAt: string;
  lastAccountSyncAt: string;
  lastAttendanceSyncAt: string;
  lastFullSyncAt: string;
};

export type MobileLocalDataPage<T = any> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type MobileLocalFaceAttendanceInput = {
  user?: any;
  attendanceMode?: 'auto_record';
  attendanceType?: 'auto' | 'checkin' | 'checkout';
  similarityPercent?: number;
  cooldownSeconds?: number;
  detection?: any;
};

import { getVietnameseLocalTimeStr } from '../utils/date';

function nowIsoString(): string {
  return getVietnameseLocalTimeStr();
}

function todayLocalDate(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function currentLocalTime(): string {
  const now = new Date();
  const hours = `${now.getHours()}`.padStart(2, '0');
  const minutes = `${now.getMinutes()}`.padStart(2, '0');
  const seconds = `${now.getSeconds()}`.padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const normalizedValue = Math.floor(Number(value));
  if (!Number.isFinite(normalizedValue) || normalizedValue < 1) {
    return fallback;
  }
  return normalizedValue;
}

function normalizeDateText(value: unknown, fallback = ''): string {
  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return fallback;
}

function normalizeDateRange(startDate?: unknown, endDate?: unknown) {
  const fallbackDate = todayLocalDate();
  let start = normalizeDateText(startDate, fallbackDate);
  let end = normalizeDateText(endDate, start);
  if (end < start) {
    [start, end] = [end, start];
  }
  return { start, end };
}

function normalizeAttendanceRecordPayload(row: any, index = 0): any {
  const user = row?.user || row?.detected_user || row?.employee || {};
  const employeeId = normalizeText(
    row?.employee_id ||
      row?.user_id ||
      row?.account_id ||
      user?.employee_id ||
      user?.user_id ||
      user?.id,
  );
  const name = normalizeText(
    row?.name || row?.employee_name || user?.name || user?.employee_name,
  );
  const attendanceDate = normalizeDateText(
    row?.attendance_date || row?.date || row?.check_date,
    todayLocalDate(),
  );
  const checkInTime = normalizeText(
    row?.check_in_time || row?.time || row?.attendance_time,
  );
  const checkOutTime = normalizeText(row?.check_out_time);
  const source = normalizeText(row?.source) || 'mobile_attendance_cache';
  const attendanceType = normalizeText(row?.attendance_type).toLowerCase();
  const recordKey =
    normalizeText(row?.record_key || row?.attendance_id || row?.id) ||
    (source === 'mobile_server_attendance' &&
    attendanceType !== 'record' &&
    employeeId &&
    attendanceDate
      ? `mobile-server|${employeeId}|${attendanceDate}`
      : [
          employeeId || `unknown-${index}`,
          attendanceDate,
          checkInTime,
          checkOutTime,
          index,
        ].join('|'));

  return {
    ...(row || {}),
    id: normalizeText(row?.id) || recordKey,
    attendance_id: normalizeText(row?.attendance_id) || recordKey,
    record_key: recordKey,
    employee_id: employeeId,
    user_id: normalizeText(row?.user_id || user?.user_id || user?.id),
    name,
    employee_name: normalizeText(row?.employee_name) || name,
    attendance_date: attendanceDate,
    date: normalizeText(row?.date) || attendanceDate,
    check_in_time: checkInTime,
    check_out_time: checkOutTime,
    time:
      normalizeText(row?.time || row?.attendance_time) ||
      checkInTime ||
      checkOutTime,
    status: normalizeText(row?.status),
    source,
    updated_at: normalizeText(row?.updated_at) || nowIsoString(),
  };
}

function buildAttendanceRecordKey(row: any, index: number): string {
  const dateValue = normalizeText(
    row?.attendance_date || row?.date || row?.check_date || todayLocalDate(),
  );
  const employeeId = normalizeText(
    row?.employee_id || row?.user_id || row?.account_id || `unknown-${index}`,
  );
  const checkInTime = normalizeText(
    row?.check_in_time || row?.time || row?.attendance_time,
  );
  const checkOutTime = normalizeText(row?.check_out_time);
  const fallbackId = normalizeText(row?.attendance_id || row?.id);

  return (
    fallbackId ||
    [employeeId, dateValue, checkInTime, checkOutTime, index].join('|')
  );
}

function buildEmployeeDateKey(row: any): string {
  const employeeId = normalizeText(
    row?.employee_id || row?.user_id || row?.account_id,
  );
  const dateValue = normalizeText(
    row?.attendance_date || row?.date || row?.check_date,
  );
  return employeeId && dateValue ? `${employeeId}|${dateValue}` : '';
}

function isLocalOnlyAttendanceRow(row: any): boolean {
  return Boolean(
    row?.local_only ||
      row?.source === 'mobile_auto_face_detect' ||
      row?.source === 'mobile_auto_face_detect_event' ||
      row?.source === 'mobile_local_face_detect' ||
      row?.source === 'mobile_server_attendance',
  );
}

function isAutoRecordLocalRow(row: any): boolean {
  return Boolean(
    row?.source === 'mobile_auto_face_detect_event' ||
      row?.attendance_type === 'record' ||
      row?.attendance_type === 'auto' ||
      row?.attendance_type_label === 'Ghi chấm công',
  );
}

function mergeLocalAttendanceIntoServerRow(serverRow: any, localRow: any): any {
  const mergedRow = { ...serverRow };
  const localCheckInTime = normalizeText(
    localRow?.check_in_time || localRow?.time,
  );
  const localCheckOutTime = normalizeText(localRow?.check_out_time);
  const serverCheckInTime = normalizeText(
    serverRow?.check_in_time || serverRow?.time,
  );
  const serverCheckOutTime = normalizeText(serverRow?.check_out_time);

  if (localCheckInTime && !serverCheckInTime) {
    mergedRow.check_in_time = localCheckInTime;
    mergedRow.time = localCheckInTime;
  }
  if (localCheckOutTime && !serverCheckOutTime) {
    mergedRow.check_out_time = localCheckOutTime;
  }

  const mergedHasLocalValue =
    (localCheckInTime && !serverCheckInTime) ||
    (localCheckOutTime && !serverCheckOutTime);
  if (mergedHasLocalValue) {
    mergedRow.status =
      normalizeText(localRow?.status) || normalizeText(serverRow?.status);
    mergedRow.local_only = true;
    mergedRow.synced = false;
    mergedRow.source = 'mobile_auto_face_detect';
    mergedRow.local_overlay = localRow;
    mergedRow.updated_at =
      normalizeText(localRow?.updated_at) ||
      normalizeText(serverRow?.updated_at);
  }

  return mergedRow;
}

async function insertOrReplaceAttendanceRow(
  db: SQLiteDatabase,
  row: any,
  updatedAt: string,
  index = 0,
): Promise<void> {
  const normalizedRow = normalizeAttendanceRecordPayload(row, index);
  const recordKey = buildAttendanceRecordKey(normalizedRow, index);
  await executeSql(
    db,
    `INSERT OR REPLACE INTO mobile_attendance_records
      (record_key, employee_id, name, attendance_date, check_in_time, check_out_time, status, updated_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recordKey,
      normalizeText(normalizedRow?.employee_id || normalizedRow?.user_id),
      normalizeText(normalizedRow?.name || normalizedRow?.employee_name),
      normalizeText(normalizedRow?.attendance_date || normalizedRow?.date),
      normalizeText(normalizedRow?.check_in_time || normalizedRow?.time),
      normalizeText(normalizedRow?.check_out_time),
      normalizeText(normalizedRow?.status),
      updatedAt,
      JSON.stringify(normalizedRow ?? {}),
    ],
  );
}

async function executeSql(
  db: SQLiteDatabase,
  statement: string,
  params: any[] = [],
): Promise<SQLiteResultSet> {
  const [result] = await db.executeSql(statement, params);
  return result;
}

function rowsFromResult<T = any>(result: SQLiteResultSet): T[] {
  const rows: T[] = [];
  const rowCount = Number(result?.rows?.length || 0);
  for (let index = 0; index < rowCount; index += 1) {
    rows.push(result.rows.item(index) as T);
  }
  return rows;
}

async function ensureSchema(db: SQLiteDatabase): Promise<void> {
  await executeSql(
    db,
    `CREATE TABLE IF NOT EXISTS mobile_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  await executeSql(
    db,
    `CREATE TABLE IF NOT EXISTS mobile_users (
      employee_id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      department TEXT,
      position TEXT,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )`,
  );
  await executeSql(
    db,
    `CREATE TABLE IF NOT EXISTS mobile_accounts (
      account_id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT,
      username TEXT,
      name TEXT,
      is_locked INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )`,
  );
  await executeSql(
    db,
    `CREATE TABLE IF NOT EXISTS mobile_attendance_records (
      record_key TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT,
      name TEXT,
      attendance_date TEXT,
      check_in_time TEXT,
      check_out_time TEXT,
      status TEXT,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )`,
  );
}

async function getDatabase(): Promise<SQLiteDatabase> {
  const databaseName = getActiveDatabaseName();
  let databasePromise = databasePromises.get(databaseName);
  if (!databasePromise) {
    databasePromise = SQLite.openDatabase({
      name: databaseName,
      location: MOBILE_DB_LOCATION,
    }).then(async db => {
      await ensureSchema(db);
      return db;
    });
    databasePromises.set(databaseName, databasePromise);
  }
  return databasePromise;
}

async function runInTransaction<T>(
  worker: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  await executeSql(db, 'BEGIN TRANSACTION');
  try {
    const value = await worker(db);
    await executeSql(db, 'COMMIT');
    return value;
  } catch (error) {
    try {
      await executeSql(db, 'ROLLBACK');
    } catch {
      // Ignore rollback errors after the original failure.
    }
    throw error;
  }
}

async function setMetaValue(
  db: SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  const updatedAt = nowIsoString();
  await executeSql(
    db,
    `INSERT OR REPLACE INTO mobile_meta (key, value, updated_at)
     VALUES (?, ?, ?)`,
    [key, value, updatedAt],
  );
}

async function getMetaValues(
  db: SQLiteDatabase,
): Promise<Record<string, string>> {
  const result = await executeSql(db, 'SELECT key, value FROM mobile_meta');
  const rows = rowsFromResult<{ key: string; value: string }>(result);
  return rows.reduce<Record<string, string>>((accumulator, row) => {
    accumulator[row.key] = normalizeText(row.value);
    return accumulator;
  }, {});
}

function inflatePayloadRows(rows: Array<{ payload_json: string }>): any[] {
  return rows.map(row => safeJsonParse(row.payload_json, {}));
}

async function replaceEmployees(
  rows: any[],
  syncedAt = nowIsoString(),
): Promise<void> {
  await runInTransaction(async db => {
    await executeSql(db, 'DELETE FROM mobile_users');
    for (const row of rows) {
      const employeeId = normalizeText(row?.employee_id || row?.code);
      if (!employeeId) {
        continue;
      }
      await executeSql(
        db,
        `INSERT OR REPLACE INTO mobile_users
          (employee_id, name, department, position, updated_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          employeeId,
          normalizeText(row?.name),
          normalizeText(row?.department),
          normalizeText(row?.position),
          syncedAt,
          JSON.stringify(row ?? {}),
        ],
      );
    }
    await setMetaValue(db, META_LAST_EMPLOYEE_SYNC, syncedAt);
  });
}

async function replaceAccounts(
  rows: any[],
  syncedAt = nowIsoString(),
): Promise<void> {
  await runInTransaction(async db => {
    await executeSql(db, 'DELETE FROM mobile_accounts');
    for (const row of rows) {
      const accountId = normalizeText(
        row?.account_id || row?.id || row?.user_id || row?.username,
      );
      if (!accountId) {
        continue;
      }
      await executeSql(
        db,
        `INSERT OR REPLACE INTO mobile_accounts
          (account_id, employee_id, username, name, is_locked, failed_attempts, updated_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          normalizeText(row?.employee_id),
          normalizeText(row?.username),
          normalizeText(row?.name),
          row?.is_locked ? 1 : 0,
          Number(row?.failed_attempts || 0),
          syncedAt,
          JSON.stringify(row ?? {}),
        ],
      );
    }
    await setMetaValue(db, META_LAST_ACCOUNT_SYNC, syncedAt);
  });
}

async function replaceAttendanceRecords(
  rows: any[],
  syncedAt = nowIsoString(),
): Promise<void> {
  await runInTransaction(async db => {
    const existingLocalResult = await executeSql(
      db,
      'SELECT payload_json FROM mobile_attendance_records',
    );
    const localOnlyRows = inflatePayloadRows(
      rowsFromResult<{ payload_json: string }>(existingLocalResult),
    ).filter(isLocalOnlyAttendanceRow);
    const mergedRows = rows.map(row => ({ ...row }));

    for (const localRow of localOnlyRows) {
      if (isAutoRecordLocalRow(localRow)) {
        mergedRows.push(localRow);
        continue;
      }

      const localEmployeeDateKey = buildEmployeeDateKey(localRow);
      const serverIndex = mergedRows.findIndex(
        row => buildEmployeeDateKey(row) === localEmployeeDateKey,
      );
      if (serverIndex >= 0) {
        mergedRows[serverIndex] = mergeLocalAttendanceIntoServerRow(
          mergedRows[serverIndex],
          localRow,
        );
      } else {
        mergedRows.push(localRow);
      }
    }

    await executeSql(db, 'DELETE FROM mobile_attendance_records');
    for (let index = 0; index < mergedRows.length; index += 1) {
      const row = mergedRows[index];
      await insertOrReplaceAttendanceRow(
        db,
        row,
        normalizeText(row?.updated_at) || syncedAt,
        index,
      );
    }
    await setMetaValue(db, META_LAST_ATTENDANCE_SYNC, syncedAt);
  });
}

export async function upsertMobileAttendanceRecords(
  rows: any[],
  syncedAt = nowIsoString(),
): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  await runInTransaction(async db => {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      await insertOrReplaceAttendanceRow(
        db,
        row,
        normalizeText(row?.updated_at) || syncedAt,
        index,
      );
    }
    await setMetaValue(db, META_LAST_ATTENDANCE_SYNC, syncedAt);
  });
}

export async function recordMobileServerAttendanceResponse(
  response: any,
): Promise<any | null> {
  if (!response?.success) {
    return null;
  }

  const user = response?.user || response?.detected_user || {};
  const row = normalizeAttendanceRecordPayload({
    ...response,
    employee_id: response?.employee_id || user?.employee_id,
    name: response?.name || user?.name,
    attendance_date:
      response?.attendance_date || response?.date || todayLocalDate(),
    date: response?.date || response?.attendance_date || todayLocalDate(),
    source: response?.source || 'covavision_server_attendance',
    local_only: false,
    synced: true,
  });
  if (!row.employee_id) {
    return null;
  }

  recordEmployeeAttendanceTimestamp(row.employee_id, Date.now());

  const synced = true;
  return runInTransaction(async db => {
    const existingResult = await executeSql(
      db,
      `SELECT record_key, payload_json
       FROM mobile_attendance_records
       WHERE employee_id = ? AND attendance_date = ?
       ORDER BY updated_at DESC, record_key DESC
       LIMIT 1`,
      [row.employee_id, row.attendance_date],
    );
    const existingRow = rowsFromResult<{
      record_key: string;
      payload_json: string;
    }>(existingResult)[0];
    const existingPayload = existingRow
      ? safeJsonParse<any>(existingRow.payload_json, {})
      : {};

    // A face match may be saved locally before the network request. Keep that
    // stable local key when the server receipt arrives so it is not duplicated.
    const nextRow = existingPayload?.local_only
      ? {
          ...existingPayload,
          ...row,
          id: existingPayload.id || row.id,
          attendance_id: existingPayload.attendance_id || row.attendance_id,
          record_key: existingRow.record_key,
          local_only: !synced,
          synced,
          source: existingPayload.source || 'mobile_auto_face_detect',
        }
      : {
          ...row,
          synced,
        };

    await insertOrReplaceAttendanceRow(
      db,
      nextRow,
      normalizeText(nextRow?.updated_at) || nowIsoString(),
    );
    return nextRow;
  });
}

export async function initializeMobileLocalDataStore(): Promise<void> {
  await getDatabase();
}

function parseLocalAttendanceTimeMs(
  dateValue: string,
  timeValue: unknown,
): number {
  const normalizedTime = normalizeText(timeValue);
  if (!dateValue || !normalizedTime) {
    return 0;
  }

  const parsedMs = Date.parse(`${dateValue}T${normalizedTime}`);
  return Number.isFinite(parsedMs) ? parsedMs : 0;
}

function resolveLastAttendanceEventMs(
  row: any,
  payload: any,
  fallbackDate: string,
): number {
  const dateValue = normalizeText(
    payload?.attendance_date ||
      payload?.date ||
      row?.attendance_date ||
      fallbackDate,
  );
  const timeCandidates = [
    payload?.check_out_time,
    row?.check_out_time,
    payload?.attendance_time,
    payload?.time,
    payload?.check_in_time,
    row?.check_in_time,
  ];

  for (const candidate of timeCandidates) {
    const parsedMs = parseLocalAttendanceTimeMs(dateValue, candidate);
    if (parsedMs > 0) {
      return parsedMs;
    }
  }

  const directCandidates = [
    row?.updated_at,
    payload?.updated_at,
    payload?.created_at,
    payload?.attendance_at,
    payload?.recorded_at,
  ];

  for (const candidate of directCandidates) {
    const parsedMs = Date.parse(normalizeText(candidate));
    if (Number.isFinite(parsedMs)) {
      return parsedMs;
    }
  }

  return 0;
}

const employeeLastAttendanceMsMap = new Map<string, number>();

export function recordEmployeeAttendanceTimestamp(
  employeeId: string,
  timestampMs: number = Date.now(),
) {
  const normId = normalizeText(employeeId);
  if (normId) {
    employeeLastAttendanceMsMap.set(normId, timestampMs);
  }
}

export function getEmployeeLastAttendanceTimestamp(employeeId: string): number {
  const normId = normalizeText(employeeId);
  return normId ? employeeLastAttendanceMsMap.get(normId) || 0 : 0;
}

function getCooldownRemainingSeconds(
  row: any,
  payload: any,
  attendanceDate: string,
  cooldownSeconds: unknown,
  targetEmployeeId?: string,
): number {
  let cooldownLimitSeconds = Math.max(
    0,
    Math.floor(Number(cooldownSeconds || 0)),
  );
  if (cooldownLimitSeconds <= 0) {
    cooldownLimitSeconds = 30; // Default 30s block when cooldown is set to 0 (no cooldown configured)
  }

  let lastEventMs = resolveLastAttendanceEventMs(
    row,
    payload,
    attendanceDate,
  );

  const empId = targetEmployeeId || row?.employee_id || payload?.employee_id;
  if (empId) {
    const memoryMs = getEmployeeLastAttendanceTimestamp(empId);
    if (memoryMs > lastEventMs) {
      lastEventMs = memoryMs;
    }
  }

  if (lastEventMs <= 0) {
    return 0;
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - lastEventMs) / 1000),
  );
  if (elapsedSeconds >= cooldownLimitSeconds) {
    return 0;
  }

  return Math.max(1, cooldownLimitSeconds - elapsedSeconds);
}

export async function recordMobileLocalFaceAttendance(
  input: MobileLocalFaceAttendanceInput,
) {
  const sourceUser = input.user || {};
  let user = sourceUser;
  const sourceEmployeeId = normalizeText(sourceUser.employee_id);
  if (!sourceEmployeeId) {
    const sourceUserIds = new Set(
      [sourceUser.user_id, sourceUser.id]
        .map(value => normalizeText(value))
        .filter(Boolean),
    );
    if (sourceUserIds.size > 0) {
      const localEmployees = await getLocalEmployees(500).catch(() => []);
      const matchedLocalEmployee = localEmployees.find((employee: any) =>
        [employee?.id, employee?.user_id]
          .map(value => normalizeText(value))
          .some(value => value && sourceUserIds.has(value)),
      );
      if (matchedLocalEmployee) {
        user = {
          ...matchedLocalEmployee,
          ...sourceUser,
          employee_id:
            normalizeText(matchedLocalEmployee?.employee_id)
            || sourceUser.employee_id,
          name:
            normalizeText(sourceUser.name)
            || normalizeText(matchedLocalEmployee?.name),
          department:
            normalizeText(sourceUser.department)
            || normalizeText(matchedLocalEmployee?.department),
          position:
            normalizeText(sourceUser.position)
            || normalizeText(matchedLocalEmployee?.position),
        };
      }
    }
  }
  const employeeId = normalizeText(user.employee_id || user.user_id || user.id);
  const name = normalizeText(user.name || user.employee_name);
  if (!employeeId) {
    throw new Error('Không có mã nhân viên để lưu chấm công local.');
  }

  const attendanceDate = todayLocalDate();
  const attendanceTime = currentLocalTime();
  const nowIso = nowIsoString();

  return runInTransaction(async transactionDb => {
    const cooldownExistingResult = await executeSql(
      transactionDb,
      `SELECT record_key, check_in_time, check_out_time, updated_at, payload_json
       FROM mobile_attendance_records
       WHERE employee_id = ? AND attendance_date = ?
       ORDER BY updated_at DESC, record_key DESC
       LIMIT 1`,
      [employeeId, attendanceDate],
    );
    const cooldownExistingRow = rowsFromResult<{
      record_key: string;
      check_in_time: string;
      check_out_time: string;
      updated_at: string;
      payload_json: string;
    }>(cooldownExistingResult)[0];
    const cooldownExistingPayload: any = cooldownExistingRow
      ? safeJsonParse<any>(cooldownExistingRow.payload_json, {})
      : {};
    const cooldownRemainingSeconds = getCooldownRemainingSeconds(
      cooldownExistingRow,
      cooldownExistingPayload,
      attendanceDate,
      input.cooldownSeconds,
      employeeId,
    );

    if (cooldownRemainingSeconds > 0) {
      return {
        success: true,
        skipped: true,
        cooldown: true,
        cooldown_remaining_seconds: cooldownRemainingSeconds,
        message: `Vui lòng thử lại sau ${cooldownRemainingSeconds}s.`,
        record: cooldownExistingPayload,
      };
    }

    const recordKey = `mobile-auto|${employeeId}|${attendanceDate}|${Date.now()}`;
    const nextRecord = {
      id: recordKey,
      attendance_id: recordKey,
      record_key: recordKey,
      employee_id: employeeId,
      user_id: normalizeText(user.id || user.user_id),
      name,
      employee_name: name,
      department: normalizeText(user.department),
      position: normalizeText(user.position),
      attendance_date: attendanceDate,
      date: attendanceDate,
      check_in_time: attendanceTime,
      check_out_time: '',
      time: attendanceTime,
      attendance_time: attendanceTime,
      attendance_type: 'record',
      attendance_type_label: 'Ghi chấm công',
      status: 'Đã ghi chấm công tự động local',
      source: 'mobile_auto_face_detect_event',
      local_only: true,
      synced: false,
      similarity_percent: Number(input.similarityPercent || 0),
      detection: input.detection || null,
      updated_at: nowIso,
    };

    await insertOrReplaceAttendanceRow(transactionDb, nextRecord, nowIso);
    recordEmployeeAttendanceTimestamp(employeeId, Date.now());

    return {
      success: true,
      skipped: false,
      message: `Ghi chấm công tự động local thành công cho ${
        name || employeeId
      }.`,
      record: nextRecord,
      attendanceType: 'record',
      attendanceTypeLabel: 'Ghi chấm công',
    };
  });
}

async function getLocalDataPage(
  tableName: 'mobile_users' | 'mobile_accounts' | 'mobile_attendance_records',
  orderByClause: string,
  options?: { page?: number; pageSize?: number },
): Promise<MobileLocalDataPage<any>> {
  const db = await getDatabase();
  const pageSize = normalizePositiveInt(options?.pageSize, 12);
  const requestedPage = normalizePositiveInt(options?.page, 1);

  const countResult = await executeSql(
    db,
    `SELECT COUNT(*) AS total
     FROM ${tableName}`,
  );
  const total = Number(
    rowsFromResult<{ total: number }>(countResult)[0]?.total || 0,
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = total === 0 ? 1 : Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const selectSql =
    tableName === 'mobile_attendance_records'
      ? `SELECT record_key, payload_json FROM ${tableName} ORDER BY ${orderByClause} LIMIT ? OFFSET ?`
      : `SELECT payload_json FROM ${tableName} ORDER BY ${orderByClause} LIMIT ? OFFSET ?`;

  const rowsResult = await executeSql(db, selectSql, [pageSize, offset]);

  const rawRows = rowsFromResult<{ record_key?: string; payload_json: string }>(rowsResult);
  const items = rawRows.map(r => {
    let item: any = {};
    try {
      item = JSON.parse(r.payload_json || '{}');
    } catch {}
    if (r.record_key && !item.record_key) {
      item.record_key = r.record_key;
    }
    return item;
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getLocalEmployeesPage(options?: {
  page?: number;
  pageSize?: number;
}): Promise<MobileLocalDataPage<any>> {
  return getLocalDataPage(
    'mobile_users',
    'name COLLATE NOCASE ASC, employee_id ASC',
    options,
  );
}

export async function getLocalEmployees(limit = 120): Promise<any[]> {
  return (await getLocalEmployeesPage({ page: 1, pageSize: limit })).items;
}

export async function getLocalAccountsPage(options?: {
  page?: number;
  pageSize?: number;
}): Promise<MobileLocalDataPage<any>> {
  return getLocalDataPage(
    'mobile_accounts',
    'username COLLATE NOCASE ASC, account_id ASC',
    options,
  );
}

export async function getLocalAccounts(limit = 120): Promise<any[]> {
  return (await getLocalAccountsPage({ page: 1, pageSize: limit })).items;
}

export async function getLocalTodayAttendancePage(options?: {
  page?: number;
  pageSize?: number;
}): Promise<MobileLocalDataPage<any>> {
  return getLocalDataPage(
    'mobile_attendance_records',
    'attendance_date DESC, check_in_time DESC, record_key DESC',
    options,
  );
}

export async function getLocalTodayAttendance(limit = 120): Promise<any[]> {
  return (await getLocalTodayAttendancePage({ page: 1, pageSize: limit }))
    .items;
}

export async function getLocalAttendanceForEmployee(
  employeeId: string,
  attendanceDate = todayLocalDate(),
  limit = 150,
): Promise<any[]> {
  const normalizedEmployeeId = normalizeText(employeeId);
  if (!normalizedEmployeeId) {
    return [];
  }

  const db = await getDatabase();
  const result = await executeSql(
    db,
    `SELECT payload_json
     FROM mobile_attendance_records
     WHERE employee_id = ? AND attendance_date = ?
     ORDER BY updated_at DESC, check_in_time DESC, record_key DESC
     LIMIT ?`,
    [
      normalizedEmployeeId,
      normalizeText(attendanceDate),
      Math.max(1, Math.min(limit, 300)),
    ],
  );
  return inflatePayloadRows(rowsFromResult<{ payload_json: string }>(result));
}

export async function getLocalAttendanceRange(
  startDate = todayLocalDate(),
  endDate = startDate,
  limit = 500,
): Promise<any[]> {
  const { start, end } = normalizeDateRange(startDate, endDate);
  const db = await getDatabase();
  const result = await executeSql(
    db,
    `SELECT payload_json
     FROM mobile_attendance_records
     WHERE attendance_date >= ? AND attendance_date <= ?
     ORDER BY attendance_date DESC, check_in_time DESC, updated_at DESC, record_key DESC
     LIMIT ?`,
    [start, end, Math.max(1, Math.min(limit, 1000))],
  );
  return inflatePayloadRows(rowsFromResult<{ payload_json: string }>(result));
}

export async function getLocalAttendanceForEmployeeRange(
  employeeId: string,
  startDate = todayLocalDate(),
  endDate = startDate,
  limit = 150,
): Promise<any[]> {
  const normalizedEmployeeId = normalizeText(employeeId);
  if (!normalizedEmployeeId) {
    return [];
  }

  const { start, end } = normalizeDateRange(startDate, endDate);
  const db = await getDatabase();
  const result = await executeSql(
    db,
    `SELECT payload_json
     FROM mobile_attendance_records
     WHERE employee_id = ? AND attendance_date >= ? AND attendance_date <= ?
     ORDER BY attendance_date DESC, updated_at DESC, check_in_time DESC, record_key DESC
     LIMIT ?`,
    [normalizedEmployeeId, start, end, Math.max(1, Math.min(limit, 300))],
  );
  return inflatePayloadRows(rowsFromResult<{ payload_json: string }>(result));
}

export async function getMobileLocalDataSummary(): Promise<MobileLocalDataSummary> {
  const db = await getDatabase();
  const [
    employeeCountResult,
    accountCountResult,
    attendanceCountResult,
    metaValues,
  ] = await Promise.all([
    executeSql(db, 'SELECT COUNT(*) AS total FROM mobile_users'),
    executeSql(db, 'SELECT COUNT(*) AS total FROM mobile_accounts'),
    executeSql(db, 'SELECT COUNT(*) AS total FROM mobile_attendance_records'),
    getMetaValues(db),
  ]);

  const employeesCount = Number(
    rowsFromResult<{ total: number }>(employeeCountResult)[0]?.total || 0,
  );
  const accountsCount = Number(
    rowsFromResult<{ total: number }>(accountCountResult)[0]?.total || 0,
  );
  const attendanceCount = Number(
    rowsFromResult<{ total: number }>(attendanceCountResult)[0]?.total || 0,
  );

  return {
    databaseName: getActiveDatabaseName(),
    employeesCount,
    accountsCount,
    attendanceCount,
    lastEmployeeSyncAt: metaValues[META_LAST_EMPLOYEE_SYNC] || '',
    lastAccountSyncAt: metaValues[META_LAST_ACCOUNT_SYNC] || '',
    lastAttendanceSyncAt: metaValues[META_LAST_ATTENDANCE_SYNC] || '',
    lastFullSyncAt: metaValues[META_LAST_FULL_SYNC] || '',
  };
}

export async function syncMobileEmployeesFromServer() {
  const response = await api.getEmployees();
  if (!response?.success) {
    throw new Error(response?.message || 'Không đồng bộ được nhân viên CovaVision.');
  }

  const mergedRows = (Array.isArray(response.employees) ? response.employees : [])
    .map((employee: any) => {
      const employeeId = normalizeText(employee?.employee_id || employee?.id);
      if (!employeeId) return null;
      const imageUri = normalizeText(
        employee?.local_image_url || employee?.image_url || employee?.image_base64,
      );
      return {
        ...employee,
        employee_id: employeeId,
        image_url: imageUri,
        image_base64: normalizeText(employee?.image_base64),
        local_image_url: imageUri,
        status_code: employee?.has_face ? 'ready' : 'empty',
        status_text: employee?.has_face
          ? 'Đã đăng ký khuôn mặt'
          : 'Chưa đăng ký khuôn mặt',
      };
    })
    .filter(Boolean);

  const syncedAt = nowIsoString();
  await replaceEmployees(mergedRows, syncedAt);
  return {
    count: mergedRows.length,
    syncedAt,
    summary: await getMobileLocalDataSummary(),
  };
}

export async function syncMobileAccountsFromServer() {
  const response = await api.getEmployeeAccounts();
  if (!response?.success) {
    throw new Error(response?.message || 'Không đồng bộ được tài khoản local.');
  }
  const rows = Array.isArray(response.accounts) ? response.accounts : [];
  const syncedAt = nowIsoString();
  await replaceAccounts(rows, syncedAt);
  return {
    count: rows.length,
    syncedAt,
    summary: await getMobileLocalDataSummary(),
  };
}

export async function syncMobileTodayAttendanceFromServer() {
  const response = await api.getTodayAttendance();
  if (!response?.success) {
    throw new Error(
      response?.message || 'Không đồng bộ được chấm công hôm nay.',
    );
  }
  const rows = Array.isArray(response.records)
    ? response.records
    : Array.isArray(response.attendance)
      ? response.attendance
      : Array.isArray(response.data)
        ? response.data
        : [];
  const syncedAt = nowIsoString();
  await replaceAttendanceRecords(rows, syncedAt);
  return {
    count: rows.length,
    syncedAt,
    summary: await getMobileLocalDataSummary(),
  };
}

export async function syncAllMobileLocalData() {
  const employees = await syncMobileEmployeesFromServer();
  const accounts = await syncMobileAccountsFromServer();
  const attendance = await syncMobileTodayAttendanceFromServer();
  const db = await getDatabase();
  const syncedAt = nowIsoString();
  await setMetaValue(db, META_LAST_FULL_SYNC, syncedAt);
  return {
    syncedAt,
    employees,
    accounts,
    attendance,
    summary: await getMobileLocalDataSummary(),
  };
}

export async function deleteLocalEmployee(employeeId: string): Promise<void> {
  const normalizedId = normalizeText(employeeId);
  if (!normalizedId) {
    return;
  }
  await runInTransaction(async db => {
    await executeSql(db, `DELETE FROM mobile_users WHERE employee_id = ?`, [
      normalizedId,
    ]);
    await executeSql(db, `DELETE FROM mobile_accounts WHERE employee_id = ?`, [
      normalizedId,
    ]);
  });
}

export async function deleteMobileAttendanceRecord(
  ...keys: (string | number | undefined | null)[]
): Promise<boolean> {
  const validKeys = Array.from(
    new Set(
      keys
        .map(k => String(k || '').trim())
        .filter(k => k.length > 0),
    ),
  );

  if (validKeys.length === 0) {
    return false;
  }

  const db = await getDatabase();
  for (const k of validKeys) {
    await executeSql(
      db,
      'DELETE FROM mobile_attendance_records WHERE record_key = ? OR record_key LIKE ? OR employee_id = ?',
      [k, `%${k}%`, k],
    ).catch(err => console.warn('deleteMobileAttendanceRecord error:', err));
  }
  return true;
}

export async function clearMobileAttendanceRecords(): Promise<void> {
  const db = await getDatabase();
  await executeSql(db, 'DELETE FROM mobile_attendance_records');
}

export async function clearMobileLocalData() {
  await runInTransaction(async db => {
    await executeSql(db, 'DELETE FROM mobile_users');
    await executeSql(db, 'DELETE FROM mobile_accounts');
    await executeSql(db, 'DELETE FROM mobile_attendance_records');
    await executeSql(db, 'DELETE FROM mobile_meta');
  });
  return getMobileLocalDataSummary();
}

export async function exportMobileLocalDataSnapshot() {
  const [summary, employees, accounts, attendance] = await Promise.all([
    getMobileLocalDataSummary(),
    getLocalEmployees(500),
    getLocalAccounts(500),
    getLocalTodayAttendance(500),
  ]);

  return {
    exportedAt: nowIsoString(),
    summary,
    employees,
    accounts,
    attendance,
  };
}
