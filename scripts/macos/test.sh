#!/usr/bin/env bash

# ==============================================================================
# CovaVision - macOS/Linux Test Script
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

say() { printf '[CovaVision test] %s\n' "$*"; }

[ -x "$PROJECT_ROOT/.venv/bin/python" ] || {
  printf '[CovaVision test][ERROR] Chưa có .venv. Chạy ./scripts/macos/install.sh trước.\n' >&2
  exit 1
}

say "Backend pytest"
PATH="$PROJECT_ROOT/.venv/bin:$PATH" "$PROJECT_ROOT/.venv/bin/pytest" -q

say "Desktop React build"
npm --prefix "$PROJECT_ROOT/apps/desktop" run build:react

say "Mobile TypeScript (nếu có mobile)"
if [ -d "$PROJECT_ROOT/apps/mobile/node_modules" ]; then
  (cd "$PROJECT_ROOT/apps/mobile" && ./node_modules/.bin/tsc --noEmit)
  say "Mobile Jest"
  npm --prefix "$PROJECT_ROOT/apps/mobile" test -- --runInBand
fi

say "Tất cả kiểm thử đã pass."
