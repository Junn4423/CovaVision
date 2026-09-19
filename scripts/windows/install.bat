@echo off
setlocal enabledelayedexpansion

title CovaVision - Windows Installer
echo ==============================================================================
echo [CovaVision] Dang chay script cai dat he thong tren Windows...
echo ==============================================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."
cd /d "%PROJECT_ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [CovaVision][ERROR] Cai dat gap loi! Vui long kiem tra lai thong bao phia tren.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [CovaVision] Chuc mung ban! Cai dat thanh cong.
pause
exit /b 0
