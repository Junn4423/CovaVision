@echo off
setlocal enabledelayedexpansion

title CovaVision - Windows Launcher
echo ==============================================================================
echo [CovaVision] Dang khoi dong Backend va Electron App tren Windows...
echo ==============================================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."
cd /d "%PROJECT_ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [CovaVision][ERROR] Khoi dong gap loi! Xem thong tin phia tren.
    pause
    exit /b %ERRORLEVEL%
)

echo [CovaVision] Khoi dong thanh cong! Cua so nay se tu dong dong sau 5 giay...
timeout /t 5 >nul
exit /b 0
