@echo off
title CovaVision - Web Frontend
echo.
echo ============================================
echo   CovaVision - Web Frontend
echo ============================================
echo.

if not exist "node_modules" (
    echo Dependencies not installed. Running install.bat...
    call install.bat
    if errorlevel 1 exit /b 1
)

echo Starting Vite frontend at http://localhost:5173 ...
echo Backend: CovaVision FastAPI (COVAVISION_API_URL or local 127.0.0.1:8000)
npm run dev:react -- --host 0.0.0.0
