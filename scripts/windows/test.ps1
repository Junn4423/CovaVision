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
& $VenvPytest tests -v
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Backend tests thất bại!"
}

Write-Say "Chạy 2/2: Desktop Frontend Build Test (Vite)..."
npm --prefix "$ProjectRoot\apps\desktop" run build:react
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Desktop build thất bại!"
}

Write-Host ""
Write-Success "Tất cả bài kiểm tra (Pytest & Frontend Build) đều đã VƯỢT QUA (PASS)!"
Write-Host ""
