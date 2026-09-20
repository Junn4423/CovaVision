#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
BACKUP_DIR="${COVAVISION_BACKUP_DIR:-$PROJECT_ROOT/backups}"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Không tìm thấy Python virtualenv: $PYTHON_BIN" >&2
  exit 1
fi

PYTHONPATH="$PROJECT_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}" \
  "$PYTHON_BIN" -m app.db.backup --output-dir "$BACKUP_DIR"
