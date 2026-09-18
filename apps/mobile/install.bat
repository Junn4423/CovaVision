@echo off
title CovaVision Mobile - Install Dependencies
setlocal

cd /d "%~dp0"

echo.
echo ===========================================
echo   CovaVision Mobile - Install Dependencies
echo ===========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js 22+ and try again.
    pause
    exit /b 1
)
echo [OK] Node:
node --version

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Reinstall Node.js and try again.
    pause
    exit /b 1
)
echo [OK] npm:
npm --version

echo.
echo [1/1] Installing npm packages for mobile app...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo ===========================================
echo   Install completed.
echo ===========================================
echo.
echo Next step:
echo   Run start_mobile.bat after plugging Android phone via USB.
echo.
pause
