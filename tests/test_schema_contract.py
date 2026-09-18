from pathlib import Path


SCHEMA = Path(__file__).parents[1] / "prisma" / "schema.prisma"


def test_prisma_schema_uses_mysql_and_named_business_tables() -> None:
    source = SCHEMA.read_text(encoding="utf-8")

    assert 'provider = "mysql"' in source
    assert 'provider = "prisma-client-py"' in source
    assert '@@map("employees")' in source
    assert '@@map("employee_faces")' in source
    assert '@@map("attendance_records")' in source
    assert "lv000" not in source.lower()

