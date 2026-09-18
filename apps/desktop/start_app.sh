#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
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

echo "[INFO] Khởi động SOF Face AI desktop..."
echo "[INFO] Backend sử dụng: SOF gateway remote theo tài khoản đăng nhập."
exec npm run dev
