@echo off
setlocal enabledelayedexpansion

title CovaVision - Windows Stopper
echo ==============================================================================
echo [CovaVision] Dang dung cac dich vu CovaVision tren Windows...
echo ==============================================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."
cd /d "%PROJECT_ROOT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop.ps1"

echo.
echo [CovaVision] Da dung thanh cong cac tien trinh.
timeout /t 3 >nul
exit /b 0
