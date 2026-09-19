@echo off
setlocal enabledelayedexpansion

title CovaVision - Test Suite
echo ==============================================================================
echo [CovaVision] Dang chay kiem thu toan bo du an tren Windows...
echo ==============================================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."
cd /d "%PROJECT_ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%test.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [CovaVision][ERROR] Co bai kiem thu that bai!
    pause
    exit /b %ERRORLEVEL%
)

pause
exit /b 0
