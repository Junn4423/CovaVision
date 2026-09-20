$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$VenvPrisma = Join-Path $ProjectRoot ".venv\Scripts\prisma.exe"
$BackupDir = if ($env:COVAVISION_BACKUP_DIR) { $env:COVAVISION_BACKUP_DIR } else { Join-Path $ProjectRoot "backups" }

if (-not (Test-Path -LiteralPath $VenvPython) -or -not (Test-Path -LiteralPath $VenvPrisma)) {
    throw "Chưa cài đủ Python virtualenv/Prisma CLI."
}

$env:PYTHONPATH = Join-Path $ProjectRoot "backend"
& $VenvPython -m app.db.backup --output-dir $BackupDir
if ($LASTEXITCODE -ne 0) { throw "Backup MySQL thất bại; dừng migrate." }

& $VenvPrisma migrate deploy --schema (Join-Path $ProjectRoot "prisma\schema.prisma")
if ($LASTEXITCODE -ne 0) { throw "Prisma migrate deploy thất bại." }
