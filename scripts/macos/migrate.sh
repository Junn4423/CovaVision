#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
PRISMA_BIN="$PROJECT_ROOT/.venv/bin/prisma"
BACKUP_DIR="${COVAVISION_BACKUP_DIR:-$PROJECT_ROOT/backups}"

if [ ! -x "$PYTHON_BIN" ] || [ ! -x "$PRISMA_BIN" ]; then
  echo "Chưa cài đủ Python virtualenv/Prisma CLI." >&2
  exit 1
fi

PYTHONPATH="$PROJECT_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}" \
  "$PYTHON_BIN" -m app.db.backup --output-dir "$BACKUP_DIR"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}" \
  "$PRISMA_BIN" migrate deploy --schema "$PROJECT_ROOT/prisma/schema.prisma"
