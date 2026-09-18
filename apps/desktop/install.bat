@echo off
title CovaVision - Install Desktop
echo.
echo ============================================
echo   CovaVision - Install Desktop
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 18 or newer.
    pause
    exit /b 1
)

echo [OK] Node.js:
node --version
echo.
echo Installing frontend dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies.
    pause
    exit /b 1
)

echo.
echo Installation complete. CovaVision uses the FastAPI backend.
pause
