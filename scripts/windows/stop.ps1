# ==============================================================================
# CovaVision - Windows Stop Script (PowerShell)
# ==============================================================================

$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
$RuntimeDir = "$ProjectRoot\.runtime"
$BackendPidFile = "$RuntimeDir\backend.pid"
$DesktopPidFile = "$RuntimeDir\desktop.pid"

function Write-Say {
    param([string]$Message)
    Write-Host "[CovaVision Stop] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[CovaVision Stop][SUCCESS] $Message" -ForegroundColor Green
}

Write-Say "Dang dung cac dich vu CovaVision tren Windows..."

function Stop-ProcessTree {
    param(
        [string]$Label,
        [string]$PidFile
    )

    if (Test-Path $PidFile) {
        $targetPid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($targetPid) {
            $targetPid = $targetPid.Trim()
            if ($targetPid -match "^[0-9]+$") {
                $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Say "Dang dung $Label (PID $targetPid) va cac tien trinh con..."
                    & taskkill.exe /F /T /PID $targetPid 2>$null | Out-Null
                    Write-Say "Da gui tin hieu dung $Label (PID $targetPid)."
                } else {
                    Write-Say "Tien trinh $Label (PID $targetPid) khong con chay."
                }
            }
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

# 1. Dung Electron Desktop
Stop-ProcessTree -Label "Electron Desktop App" -PidFile $DesktopPidFile

# 2. Dung FastAPI Backend
Stop-ProcessTree -Label "FastAPI Backend" -PidFile $BackendPidFile

# 3. Quet don cac tien trinh uvicorn / electron con sot
$strayProcs = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like "*app.main:app*" -or
    $_.CommandLine -like "*scripts/dev.cjs*" -or
    $_.CommandLine -like "*run-dev.cjs*" -or
    ($_.CommandLine -like "*covavision*" -and $_.Name -eq "electron.exe")
}

foreach ($p in $strayProcs) {
    try {
        Write-Say "Don dep tien trinh: $($p.Name) (PID $($p.ProcessId))"
        & taskkill.exe /F /T /PID $($p.ProcessId) 2>$null | Out-Null
    } catch {}
}

Write-Success "Da dung hoan tat Backend va Electron Desktop App."
Write-Host "Luu y: MySQL Laragon van dang chay de phuc vu luu tru du lieu." -ForegroundColor Gray
