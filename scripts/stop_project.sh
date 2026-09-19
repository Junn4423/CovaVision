#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$PROJECT_ROOT/.runtime"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
DESKTOP_PID_FILE="$RUNTIME_DIR/desktop.pid"

say() { printf '[CovaVision stop] %s\n' "$*"; }

kill_tree() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

stop_from_file() {
  local label="$1"
  local pid_file="$2"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(sed -n '1p' "$pid_file")"
    if [[ "$pid" =~ ^[0-9]+$ ]]; then
      kill_tree "$pid"
      for _ in {1..50}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.1
      done
      say "Đã gửi tín hiệu dừng $label (PID $pid)."
    fi
    rm -f "$pid_file"
  fi
}

stop_from_file "Electron/backend process" "$DESKTOP_PID_FILE"
stop_from_file "FastAPI backend" "$BACKEND_PID_FILE"

if [ "${1:-}" = "--database" ]; then
  if command -v brew >/dev/null 2>&1; then
    service="${COVAVISION_MYSQL_SERVICE:-mysql@8.4}"
    if brew list --formula "$service" >/dev/null 2>&1; then
      brew services stop "$service" >/dev/null || true
      say "Đã dừng MySQL service $service."
    else
      say "Không dừng MySQL: không tìm thấy Homebrew service $service."
    fi
  else
    say "Không dừng MySQL: không tìm thấy Homebrew."
  fi
else
  say "Giữ MySQL đang chạy (database dùng chung). Dùng --database nếu thực sự cần dừng."
fi
