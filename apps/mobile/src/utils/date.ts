export function getVietnameseLocalTimeStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function getVietnameseDateStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatAnyToLocalDateTime(raw?: any): string {
  if (!raw) return getVietnameseLocalTimeStr();
  const str = String(raw).trim();
  if (!str) return getVietnameseLocalTimeStr();

  // If already formatted like YYYY-MM-DD HH:mm:ss
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    return str;
  }

  // Handle ISO strings with 'T' (e.g., 2026-07-25T05:41:00.000Z)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return getVietnameseLocalTimeStr(parsed);
  }

  return str;
}
