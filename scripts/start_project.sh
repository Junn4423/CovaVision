#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$PROJECT_ROOT/.runtime"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
DESKTOP_PID_FILE="$RUNTIME_DIR/desktop.pid"
BACKEND_LOG="$RUNTIME_DIR/backend.log"
DESKTOP_LOG="$RUNTIME_DIR/desktop.log"
mkdir -p "$RUNTIME_DIR"
cd "$PROJECT_ROOT"

say() { printf '[CovaVision start] %s\n' "$*"; }
fail() { printf '[CovaVision start][ERROR] %s\n' "$*" >&2; exit 1; }

[ -x "$PROJECT_ROOT/.venv/bin/python" ] || fail "Chưa có .venv. Chạy ./scripts/setup_local.sh trước."
[ -d "$PROJECT_ROOT/apps/desktop/node_modules" ] || fail "Chưa có Electron dependencies. Chạy ./scripts/setup_local.sh trước."

if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_ROOT/.env"
  set +a
fi

export COVAVISION_DATA_DIR="${COVAVISION_DATA_DIR:-$PROJECT_ROOT/data}"
export PYTHONPATH="$PROJECT_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"
api_host="${API_HOST:-127.0.0.1}"
api_port="${API_PORT:-8000}"
health_host="$api_host"
[ "$health_host" = "0.0.0.0" ] && health_host="127.0.0.1"
backend_url="${COVAVISION_API_URL:-http://$health_host:$api_port}"

if [ "$backend_url" = "http://$health_host:$api_port" ] || [ "$backend_url" = "http://127.0.0.1:$api_port" ]; then
  if ! curl --silent --fail --max-time 1 "$backend_url/health" >/dev/null 2>&1; then
    say "Khởi động FastAPI backend tại $api_host:$api_port..."
    nohup "$PROJECT_ROOT/.venv/bin/python" -m uvicorn app.main:app \
      --host "$api_host" --port "$api_port" >"$BACKEND_LOG" 2>&1 &
    backend_pid=$!
    printf '%s\n' "$backend_pid" > "$BACKEND_PID_FILE"
  else
    say "Backend đã chạy tại $backend_url."
  fi
else
  say "Dùng backend đã cấu hình: $backend_url"
fi

deadline=$((SECONDS + 30))
until curl --silent --fail --max-time 1 "$backend_url/health" >/dev/null 2>&1; do
  [ "$SECONDS" -lt "$deadline" ] || fail "Backend không phản hồi. Xem log: $BACKEND_LOG"
  sleep 1
done

if [ "${COVAVISION_DESKTOP_MODE:-dev}" = "installed" ]; then
  command -v open >/dev/null 2>&1 || fail "Chế độ installed cần lệnh open trên macOS."
  app_name="${COVAVISION_ELECTRON_APP:-CovaVision}"
  say "Mở Electron đã cài: $app_name"
  open -a "$app_name"
  say "Backend đang chạy; dùng ./scripts/stop_project.sh để dừng backend."
  exit 0
fi

if [ -f "$DESKTOP_PID_FILE" ] && kill -0 "$(cat "$DESKTOP_PID_FILE")" 2>/dev/null; then
  say "Electron dev đã chạy (PID $(cat "$DESKTOP_PID_FILE"))."
  exit 0
fi

say "Khởi động Electron dev..."
nohup npm --prefix "$PROJECT_ROOT/apps/desktop" run dev >"$DESKTOP_LOG" 2>&1 &
desktop_pid=$!
printf '%s\n' "$desktop_pid" > "$DESKTOP_PID_FILE"
say "Đã chạy. Backend: $backend_url; log desktop: $DESKTOP_LOG"
