# ==============================================================================
# CovaVision - Windows Test Suite Script (PowerShell)
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $ProjectRoot

function Write-Say {
    param([string]$Message)
    Write-Host "[CovaVision Test] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[CovaVision Test][SUCCESS] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[CovaVision Test][ERROR] $Message" -ForegroundColor Red
    exit 1
}

$VenvDir = "$ProjectRoot\.venv"
$VenvPytest = "$VenvDir\Scripts\pytest.exe"

if (-not (Test-Path $VenvPytest)) {
    Write-Fail "Chưa tìm thấy pytest trong .venv. Vui lòng chạy .\scripts\windows\install.bat trước."
}

$env:PATH = "$VenvDir\Scripts;" + $env:PATH
$env:PYTHONPATH = "$ProjectRoot\backend"

Write-Say "Chạy 1/2: Backend Pytest Suites..."
& $VenvPytest tests -v --cov=backend/app --cov-report=term-missing --cov-report=html:coverage/backend
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Backend tests thất bại!"
}

Write-Say "Chạy 2/2: Desktop Frontend Build Test (Vite)..."
npm --prefix "$ProjectRoot\apps\desktop" run build:react
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Desktop build thất bại!"
}

if (Test-Path "$ProjectRoot\apps\mobile\node_modules") {
    Write-Say "Mobile TypeScript + Jest..."
    Push-Location "$ProjectRoot\apps\mobile"
    npx --no-install tsc --noEmit
    $mobileTypecheckExit = $LASTEXITCODE
    Pop-Location
    if ($mobileTypecheckExit -ne 0) {
        Write-Fail "Mobile TypeScript tests failed."
    }
    npm --prefix "$ProjectRoot\apps\mobile" test -- --runInBand
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Mobile Jest tests failed."
    }
}

Write-Host ""
Write-Success "Tất cả bài kiểm tra (Pytest & Frontend Build) đều đã VƯỢT QUA (PASS)!"
Write-Host ""
