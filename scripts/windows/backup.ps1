$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$BackupDir = if ($env:COVAVISION_BACKUP_DIR) { $env:COVAVISION_BACKUP_DIR } else { Join-Path $ProjectRoot "backups" }

if (-not (Test-Path -LiteralPath $VenvPython)) {
    throw "Không tìm thấy Python virtualenv: $VenvPython"
}

$env:PYTHONPATH = Join-Path $ProjectRoot "backend"
& $VenvPython -m app.db.backup --output-dir $BackupDir
if ($LASTEXITCODE -ne 0) {
    throw "Backup MySQL thất bại."
}
