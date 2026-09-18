#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js 18+ chưa được cài đặt."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm chưa được cài đặt."
  exit 1
fi

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$node_major" -lt 18 ]; then
  echo "[ERROR] Cần Node.js 18 trở lên. Phiên bản hiện tại: $(node --version)"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[INFO] Chưa có dependency, đang chạy npm install..."
  npm install
fi

PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="$(command -v python3 || true)"
fi
if [ -z "$PYTHON_BIN" ]; then
  echo "[ERROR] Chưa có Python 3 để chạy CovaVision API."
  exit 1
fi

PRISMA_BIN="$PROJECT_ROOT/.venv/bin/prisma"
if [ -x "$PRISMA_BIN" ] && [ -f "$PROJECT_ROOT/prisma/schema.prisma" ]; then
  echo "[INFO] Chuẩn bị Prisma client Python..."
  PATH="$PROJECT_ROOT/.venv/bin:$PATH" \
    DATABASE_URL="${DATABASE_URL:-mysql://covavision:change-me@127.0.0.1:3306/covavision}" \
    "$PRISMA_BIN" generate --schema "$PROJECT_ROOT/prisma/schema.prisma" >/dev/null
fi

BACKEND_URL="${COVAVISION_API_URL:-http://127.0.0.1:8000}"
if [[ "$BACKEND_URL" != "http://127.0.0.1:8000" && "$BACKEND_URL" != "http://localhost:8000" ]]; then
  echo "[INFO] Dùng CovaVision API đã cấu hình: $BACKEND_URL"
else
  backend_pid=""
  if ! curl --silent --fail --max-time 1 "$BACKEND_URL/health" >/dev/null 2>&1; then
    echo "[INFO] Khởi động CovaVision FastAPI backend..."
    PYTHONPATH="$PROJECT_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}" "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
    backend_pid=$!
    trap 'if [ -n "${backend_pid:-}" ]; then kill "$backend_pid" 2>/dev/null || true; fi' EXIT INT TERM
  fi
fi

echo "[INFO] Khởi động CovaVision desktop..."
echo "[INFO] RTSP chỉ được mở bởi backend và frontend nhận stream proxy có xác thực."
exec npm run dev
