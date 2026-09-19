# ==============================================================================
# CovaVision - Windows Start Script (PowerShell)
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
$RuntimeDir = "$ProjectRoot\.runtime"
$BackendPidFile = "$RuntimeDir\backend.pid"
$DesktopPidFile = "$RuntimeDir\desktop.pid"
$BackendLog = "$RuntimeDir\backend.log"
$DesktopLog = "$RuntimeDir\desktop.log"

if (-not (Test-Path $RuntimeDir)) {
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
}

Set-Location $ProjectRoot

function Write-Say {
    param([string]$Message)
    Write-Host "[CovaVision Start] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[CovaVision Start][SUCCESS] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[CovaVision Start][ERROR] $Message" -ForegroundColor Red
    exit 1
}

# 1. Kiem tra moi truong
$VenvPython = "$ProjectRoot\.venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Fail "Chua co virtualenv .venv. Hay chay .\scripts\windows\install.bat truoc."
}

if (-not (Test-Path "$ProjectRoot\apps\desktop\node_modules")) {
    Write-Fail "Chua cai dat thu vien Desktop. Hay chay .\scripts\windows\install.bat truoc."
}

# 2. Doc file .env
if (Test-Path "$ProjectRoot\.env") {
    Get-Content "$ProjectRoot\.env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $varName = $parts[0].Trim()
            $varVal = $parts[1].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($varName, $varVal, [System.EnvironmentVariableTarget]::Process)
        }
    }
}

$apiHost = if ($env:API_HOST) { $env:API_HOST } else { "127.0.0.1" }
$apiPort = if ($env:API_PORT) { $env:API_PORT } else { "8000" }
$backendUrl = "http://${apiHost}:${apiPort}"

# 3. Khoi dong Backend FastAPI (Detached Process qua WMI)
$backendRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "$backendUrl/health" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($resp.status -eq "ok") {
        $backendRunning = $true
    }
} catch {
    $backendRunning = $false
}

if (-not $backendRunning) {
    Write-Say "Khoi dong FastAPI backend tai $backendUrl..."
    $backendCmd = "cmd.exe /c cd /d `"$ProjectRoot`" && set PYTHONPATH=$ProjectRoot\backend&& set COVAVISION_DATA_DIR=$ProjectRoot\data&& `"$VenvPython`" -m uvicorn app.main:app --host $apiHost --port $apiPort <nul > `"$BackendLog`" 2>&1"
    
    $spawnRes = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = $backendCmd
        CurrentDirectory = $ProjectRoot
    }

    if ($spawnRes.ReturnValue -ne 0) {
        Write-Fail "Khong the khoi dong tien trinh Backend (Return code: $($spawnRes.ReturnValue))."
    }

    $spawnRes.ProcessId | Out-File -FilePath $BackendPidFile -Encoding ascii -Force
    Write-Say "Backend da khoi dong (PID: $($spawnRes.ProcessId))."
} else {
    Write-Say "FastAPI backend da chay san tai $backendUrl."
}

# Cho backend san sang (toi da 30s)
Write-Say "Dang kiem tra ket noi toi backend..."
$deadline = (Get-Date).AddSeconds(30)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-RestMethod -Uri "$backendUrl/health" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($resp.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {
        # Dang cho backend san sang
    }
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    Write-Fail "Backend khong phan hoi sau 30 giay. Vui long kiem tra log: $BackendLog"
}
Write-Success "Backend da san sang tai $backendUrl!"

# 4. Khoi dong Desktop Electron App (Detached Process qua WMI)
$desktopRunning = $false
if (Test-Path $DesktopPidFile) {
    $existingPid = (Get-Content $DesktopPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($existingPid) {
        $existingPid = $existingPid.Trim()
        if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
            $desktopRunning = $true
            Write-Say "Electron desktop app da chay (PID: $existingPid)."
        } else {
            Remove-Item $DesktopPidFile -Force -ErrorAction SilentlyContinue
        }
    }
}

if (-not $desktopRunning) {
    Write-Say "Khoi dong Electron Desktop App..."
    $desktopCmd = "cmd.exe /c cd /d `"$ProjectRoot`" && npm --prefix apps\desktop run dev <nul > `"$DesktopLog`" 2>&1"
    
    $spawnDesktopRes = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = $desktopCmd
        CurrentDirectory = $ProjectRoot
    }

    if ($spawnDesktopRes.ReturnValue -ne 0) {
        Write-Fail "Khong the khoi dong Electron App (Return code: $($spawnDesktopRes.ReturnValue))."
    }

    $spawnDesktopRes.ProcessId | Out-File -FilePath $DesktopPidFile -Encoding ascii -Force
    Write-Success "Electron Desktop App da duoc kich hoat (PID: $($spawnDesktopRes.ProcessId))!"
}

Write-Host ""
Write-Success "Toan bo he thong CovaVision da khoi chay thanh cong!"
Write-Host "- Backend API  : $backendUrl" -ForegroundColor Cyan
Write-Host "- API Swagger  : $backendUrl/docs" -ForegroundColor Cyan
Write-Host "- Vite Dev URL : http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "- Log backend  : $BackendLog" -ForegroundColor Gray
Write-Host "- Log desktop  : $DesktopLog" -ForegroundColor Gray
Write-Host "- De dung du an, chay: .\scripts\windows\stop.bat hoac .\scripts\windows\stop.ps1" -ForegroundColor Yellow
Write-Host ""
