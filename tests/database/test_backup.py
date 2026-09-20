from pathlib import Path

from app.db.backup import backup_database, build_mysqldump_command, parse_mysql_url


def test_parse_mysql_url_decodes_credentials() -> None:
    target = parse_mysql_url("mysql://backup%40user:p%40ss@db.example:3307/covavision")

    assert target == {
        "host": "db.example",
        "port": 3307,
        "user": "backup@user",
        "password": "p@ss",
        "database": "covavision",
    }


def test_mysqldump_command_never_contains_password() -> None:
    target = parse_mysql_url("mysql://backup:p%40ss@db.example/covavision")

    command = build_mysqldump_command(target, binary="mysqldump")

    assert "p@ss" not in command
    assert command[-1] == "covavision"
    assert "--single-transaction" in command
    assert "--routines" in command
    assert "--triggers" in command


def test_backup_writes_dump_and_keeps_password_in_environment(monkeypatch, tmp_path: Path) -> None:
    calls = []

    def fake_run(command, *, env, stdout, check, stderr):
        calls.append((command, env, check, stderr))
        stdout.write(b"MYSQL DUMP")

    monkeypatch.setattr("app.db.backup.subprocess.run", fake_run)

    output = backup_database(
        "mysql://backup:p%40ss@db.example/covavision",
        tmp_path,
        binary="mysqldump",
    )

    assert output.read_bytes() == b"MYSQL DUMP"
    assert calls[0][1]["MYSQL_PWD"] == "p@ss"
    assert "p@ss" not in calls[0][0]


def test_schema_has_a_tracked_initial_prisma_migration() -> None:
    root = Path(__file__).parents[2]
    migrations = list((root / "prisma" / "migrations").glob("*/migration.sql"))

    assert migrations
    assert "CREATE TABLE `organizations`" in migrations[0].read_text(encoding="utf-8")
