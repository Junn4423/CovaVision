#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

say() { printf '[CovaVision test] %s\n' "$*"; }

[ -x "$PROJECT_ROOT/.venv/bin/python" ] || {
  printf '[CovaVision test][ERROR] Chưa có .venv. Chạy ./scripts/setup_local.sh trước.\n' >&2
  exit 1
}

say "Backend pytest"
PATH="$PROJECT_ROOT/.venv/bin:$PATH" "$PROJECT_ROOT/.venv/bin/pytest" -q

say "Desktop React build"
npm --prefix "$PROJECT_ROOT/apps/desktop" run build:react

say "Mobile TypeScript"
(cd "$PROJECT_ROOT/apps/mobile" && ./node_modules/.bin/tsc --noEmit)

say "Mobile Jest"
npm --prefix "$PROJECT_ROOT/apps/mobile" test -- --runInBand

say "Tất cả kiểm thử đã pass."
