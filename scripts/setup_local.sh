#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

say() { printf '[CovaVision setup] %s\n' "$*"; }
fail() { printf '[CovaVision setup][ERROR] %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || fail "Cần Python 3.9 trở lên."
command -v node >/dev/null 2>&1 || fail "Cần Node.js 18 trở lên."
command -v npm >/dev/null 2>&1 || fail "Cần npm."

python3 - <<'PY'
import sys

if sys.version_info < (3, 9):
    raise SystemExit("Cần Python 3.9 trở lên.")
PY

node_major="$(node -p "process.versions.node.split('.')[0]")"
[ "$node_major" -ge 18 ] || fail "Cần Node.js 18 trở lên; hiện tại là $(node --version)."

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  say "Đã tạo .env từ .env.example."
fi

set -a
# shellcheck disable=SC1091
. "$PROJECT_ROOT/.env"
set +a

PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  say "Tạo Python virtualenv..."
  python3 -m venv "$PROJECT_ROOT/.venv"
fi

say "Cài backend và vision dependencies..."
"$PYTHON_BIN" -m pip install --upgrade pip >/dev/null
"$PYTHON_BIN" -m pip install -e '.[dev,vision]'

if [ ! -d "$PROJECT_ROOT/apps/desktop/node_modules" ]; then
  say "Cài Electron dependencies..."
  npm --prefix "$PROJECT_ROOT/apps/desktop" ci
else
  say "Electron dependencies đã có."
fi

command -v mysql >/dev/null 2>&1 || fail "Chưa có mysql client. Cài MySQL trước hoặc cài Homebrew MySQL."

if command -v brew >/dev/null 2>&1; then
  mysql_service="${COVAVISION_MYSQL_SERVICE:-mysql@8.4}"
  if brew list --formula "$mysql_service" >/dev/null 2>&1; then
    if ! mysqladmin --protocol=tcp -h 127.0.0.1 -P "${COVAVISION_MYSQL_PORT:-3306}" ping >/dev/null 2>&1; then
      say "Khởi động Homebrew service $mysql_service..."
      brew services start "$mysql_service" >/dev/null
    fi
  elif brew list --formula mysql >/dev/null 2>&1; then
    if ! mysqladmin --protocol=tcp -h 127.0.0.1 -P "${COVAVISION_MYSQL_PORT:-3306}" ping >/dev/null 2>&1; then
      say "Khởi động Homebrew service mysql..."
      brew services start mysql >/dev/null
    fi
  fi
fi

mysql_host="127.0.0.1"
mysql_port="${COVAVISION_MYSQL_PORT:-3306}"
mysql_database="covavision"
mysql_user="covavision"
mysql_password="change-me"

# Read the application credentials from DATABASE_URL so an existing .env stays authoritative.
db_parts="$($PYTHON_BIN - "$DATABASE_URL" <<'PY'
from urllib.parse import unquote, urlsplit
import sys

parsed = urlsplit(sys.argv[1])
if parsed.scheme not in {"mysql", "mysql+asyncmy"}:
    raise SystemExit("DATABASE_URL phải là mysql://...")
print("\t".join([
    unquote(parsed.hostname or "127.0.0.1"),
    str(parsed.port or 3306),
    unquote(parsed.username or "covavision"),
    unquote(parsed.password or ""),
    (parsed.path or "/covavision").lstrip("/"),
]))
PY
)"
IFS=$'\t' read -r mysql_host mysql_port mysql_user mysql_password mysql_database <<< "$db_parts"

case "$mysql_database" in
  ""|*[!A-Za-z0-9_]* ) fail "Tên database trong DATABASE_URL không hợp lệ." ;;
esac
case "$mysql_user" in
  ""|*[!A-Za-z0-9_]* ) fail "Tên database user trong DATABASE_URL không hợp lệ." ;;
esac

if ! mysqladmin --protocol=tcp -h "$mysql_host" -P "$mysql_port" ping >/dev/null 2>&1; then
  fail "MySQL chưa chạy tại $mysql_host:$mysql_port. Hãy kiểm tra brew services hoặc COVAVISION_MYSQL_PORT."
fi

admin_user="${COVAVISION_MYSQL_ADMIN_USER:-root}"
admin_host="${COVAVISION_MYSQL_ADMIN_HOST:-$mysql_host}"
admin_port="${COVAVISION_MYSQL_ADMIN_PORT:-$mysql_port}"
admin_args=(--protocol=tcp -h "$admin_host" -P "$admin_port" -u "$admin_user")
if [ -n "${COVAVISION_MYSQL_ADMIN_PASSWORD:-}" ]; then
  export MYSQL_PWD="$COVAVISION_MYSQL_ADMIN_PASSWORD"
fi

sql_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\'/\'\'}"
  printf '%s' "$value"
}

escaped_database="$(sql_escape "$mysql_database")"
escaped_user="$(sql_escape "$mysql_user")"
escaped_password="$(sql_escape "$mysql_password")"

say "Tạo database/user nếu chưa có..."
mysql "${admin_args[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`$escaped_database\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$escaped_user'@'127.0.0.1' IDENTIFIED BY '$escaped_password';
ALTER USER '$escaped_user'@'127.0.0.1' IDENTIFIED BY '$escaped_password';
GRANT ALL PRIVILEGES ON \`$escaped_database\`.* TO '$escaped_user'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

say "Generate Prisma client và áp dụng schema..."
PATH="$PROJECT_ROOT/.venv/bin:$PATH" DATABASE_URL="$DATABASE_URL" \
  "$PROJECT_ROOT/.venv/bin/prisma" generate --schema "$PROJECT_ROOT/prisma/schema.prisma" >/dev/null
PATH="$PROJECT_ROOT/.venv/bin:$PATH" DATABASE_URL="$DATABASE_URL" \
  "$PROJECT_ROOT/.venv/bin/prisma" db push --schema "$PROJECT_ROOT/prisma/schema.prisma"

if [ -n "${COVAVISION_BOOTSTRAP_PASSWORD:-}" ]; then
  say "Tạo/cập nhật tài khoản quản trị từ biến môi trường..."
  PYTHONPATH="$PROJECT_ROOT/backend" DATABASE_URL="$DATABASE_URL" \
    COVAVISION_BOOTSTRAP_USERNAME="${COVAVISION_BOOTSTRAP_USERNAME:-hrm.pro1}" \
    COVAVISION_BOOTSTRAP_PASSWORD="$COVAVISION_BOOTSTRAP_PASSWORD" \
    "$PROJECT_ROOT/.venv/bin/python" "$PROJECT_ROOT/backend/scripts/bootstrap_admin.py"
else
  say "Bỏ qua bootstrap admin; đặt COVAVISION_BOOTSTRAP_PASSWORD nếu cần tạo tài khoản."
fi

say "Setup hoàn tất. Chạy: ./scripts/start_project.sh"
