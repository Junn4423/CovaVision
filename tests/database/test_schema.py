from pathlib import Path
from datetime import datetime
from types import SimpleNamespace

from app.db.repository import PrismaRepository


SCHEMA = Path(__file__).parents[2] / "prisma" / "schema.prisma"


def test_prisma_schema_uses_mysql_and_named_business_tables() -> None:
    source = SCHEMA.read_text(encoding="utf-8")

    assert 'provider = "mysql"' in source
    assert 'provider                    = "prisma-client-py"' in source
    assert '@@map("employees")' in source
    assert '@@map("employee_faces")' in source
    assert '@@map("attendance_records")' in source
    assert "lv000" not in source.lower()


def test_prisma_employee_contract_keeps_hrm_relations_and_dates() -> None:
    employee = SimpleNamespace(
        id="employee-1",
        employeeCode="NV001",
        fullName="Nguyễn Văn A",
        email="a@example.com",
        phone="0900000000",
        departmentId="department-1",
        positionId="position-1",
        avatarPath=None,
        dateOfBirth=datetime(1990, 1, 2),
        hireDate=datetime(2020, 3, 4),
        terminationDate=None,
        status="ACTIVE",
        metadata={"source": "test"},
        department=SimpleNamespace(name="Sản xuất"),
        position=SimpleNamespace(name="Nhân viên"),
        faces=[object()],
    )

    result = PrismaRepository._employee_to_dict(employee)

    assert result["department_id"] == "department-1"
    assert result["department"] == "Sản xuất"
    assert result["position_id"] == "position-1"
    assert result["position"] == "Nhân viên"
    assert result["date_of_birth"].startswith("1990-01-02")
    assert result["hire_date"].startswith("2020-03-04")
    assert result["has_face"] is True
