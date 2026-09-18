/**
 * Device & Local Data Service for Desktop (mirrors mobile mobileLocalData / nativeLocalAttendance)
 * Manages locally cached data, pending attendance synchronization queue,
 * and data snapshot exports.
 */

import { api } from './api'

const PENDING_ATTENDANCE_QUEUE_KEY = 'facecheck.offline_attendance_queue.v1'
const LAST_FULL_SYNC_KEY = 'facecheck.last_full_sync_at'
const LAST_EMPLOYEE_SYNC_KEY = 'facecheck.last_employee_sync_at'

export function getPendingAttendanceQueue() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PENDING_ATTENDANCE_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePendingAttendanceQueue(items) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PENDING_ATTENDANCE_QUEUE_KEY, JSON.stringify(items || []))
}

export function queueOfflineAttendance(record) {
  const current = getPendingAttendanceQueue()
  const key = record?.record_key || `${record?.employee_id || 'emp'}_${Date.now()}`
  const entry = {
    ...record,
    record_key: key,
    queued_at: new Date().toISOString(),
    synced_to_erp: false,
  }
  savePendingAttendanceQueue([entry, ...current.filter(i => i.record_key !== key)])
  return entry
}

export function removeOfflineAttendanceRecord(recordKey) {
  const current = getPendingAttendanceQueue()
  const filtered = current.filter(i => i.record_key !== recordKey && i.id !== recordKey)
  savePendingAttendanceQueue(filtered)
}

export async function getDeviceDataSummary() {
  const pendingQueue = getPendingAttendanceQueue()
  let employeeCount = 0
  let accountsCount = 0

  try {
    const [statsRes, accountsRes] = await Promise.all([
      api.getStats().catch(() => ({})),
      api.getAccounts ? api.getAccounts().catch(() => ({})) : Promise.resolve({}),
    ])
    employeeCount = statsRes?.total_employees || statsRes?.data?.total_employees || 0
    accountsCount = Array.isArray(accountsRes?.accounts) ? accountsRes.accounts.length : 0
  } catch {
    // Ignore error
  }

  return {
    databaseName: localStorage.getItem('facecheck.tenant_db') || 'SQLite/IndexedDB Local',
    employeesCount: employeeCount,
    accountsCount,
    pendingAttendanceCount: pendingQueue.length,
    lastFullSyncAt: localStorage.getItem(LAST_FULL_SYNC_KEY) || 'Chưa đồng bộ',
    lastEmployeeSyncAt: localStorage.getItem(LAST_EMPLOYEE_SYNC_KEY) || 'Chưa đồng bộ',
  }
}

export async function syncAllDeviceData() {
  const now = new Date().toLocaleString('vi-VN')
  localStorage.setItem(LAST_FULL_SYNC_KEY, now)
  localStorage.setItem(LAST_EMPLOYEE_SYNC_KEY, now)

  // Push pending records to ERP
  const queue = getPendingAttendanceQueue()
  let pushedCount = 0
  let errors = []

  for (const item of queue) {
    try {
      const res = await api.pushAttendanceToErp({
        employee_id: item.employee_id,
        record_key: item.record_key,
        attendance_date: item.attendance_date,
        attendance_time: item.attendance_time,
        attendance_type: item.attendance_type || 'IN',
        source: 'Desktop Auto Sync',
      })
      if (res?.success || res?.erp_pushed) {
        removeOfflineAttendanceRecord(item.record_key)
        pushedCount += 1
      }
    } catch (err) {
      errors.push(err.message)
    }
  }

  return {
    success: true,
    pushedCount,
    remainingCount: getPendingAttendanceQueue().length,
    errors,
  }
}

export function clearDeviceCache() {
  localStorage.removeItem(LAST_FULL_SYNC_KEY)
  localStorage.removeItem(LAST_EMPLOYEE_SYNC_KEY)
  // We keep the pending queue to avoid losing unsaved attendance
}

export function exportDeviceDataSnapshot() {
  const summary = {
    exportDate: new Date().toISOString(),
    pendingAttendance: getPendingAttendanceQueue(),
    activeAiChannel: localStorage.getItem('facecheck.selected_ai_channel') || 'priority',
  }

  const blob = new Blob([JSON.stringify(summary, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `snapshot_facecheck_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a)
}
