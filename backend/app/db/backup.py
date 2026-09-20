"""Safe MySQL backup helpers for deployment and schema upgrades."""

from __future__ import annotations

import argparse
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit


def parse_mysql_url(database_url: str) -> dict[str, Any]:
    parsed = urlsplit(str(database_url or "").strip())
    if parsed.scheme not in {"mysql", "mysql+asyncmy", "mysql+aiomysql"}:
        raise ValueError("DATABASE_URL phải là mysql://...")
    host = parsed.hostname or "127.0.0.1"
    database = parsed.path.lstrip("/")
    if not database:
        raise ValueError("DATABASE_URL thiếu tên database")
    return {
        "host": unquote(host),
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "database": unquote(database),
    }


def build_mysqldump_command(target: dict[str, Any], *, binary: str = "mysqldump") -> list[str]:
    return [
        binary,
        "--host",
        str(target["host"]),
        "--port",
        str(target["port"]),
        "--user",
        str(target["user"]),
        "--single-transaction",
        "--routines",
        "--triggers",
        str(target["database"]),
    ]


def backup_database(
    database_url: str,
    output_dir: str | Path,
    *,
    binary: str = "mysqldump",
    now: datetime | None = None,
) -> Path:
    target = parse_mysql_url(database_url)
    destination = Path(output_dir).expanduser()
    destination.mkdir(parents=True, exist_ok=True)
    timestamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    output_path = destination / f"covavision-{timestamp}.sql"
    environment = os.environ.copy()
    if target["password"]:
        environment["MYSQL_PWD"] = str(target["password"])
    else:
        environment.pop("MYSQL_PWD", None)

    try:
        with output_path.open("wb") as stream:
            subprocess.run(
                build_mysqldump_command(target, binary=binary),
                env=environment,
                stdout=stream,
                stderr=subprocess.PIPE,
                check=True,
            )
    except Exception:
        output_path.unlink(missing_ok=True)
        raise
    try:
        output_path.chmod(0o600)
    except OSError:
        pass
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a private CovaVision MySQL backup")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    parser.add_argument("--output-dir", default=os.getenv("COVAVISION_BACKUP_DIR", "backups"))
    parser.add_argument("--binary", default=os.getenv("MYSQLDUMP_BINARY", "mysqldump"))
    args = parser.parse_args()
    if not args.database_url:
        raise SystemExit("DATABASE_URL is required")
    output = backup_database(args.database_url, args.output_dir, binary=args.binary)
    print(output)


if __name__ == "__main__":
    main()
