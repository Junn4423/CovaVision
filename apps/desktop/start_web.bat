@echo off
title SOF Face AI - Web Frontend
echo.
echo ============================================
echo   SOF Face AI - Web Frontend
echo ============================================
echo.

if not exist "node_modules" (
    echo Dependencies not installed. Running install.bat...
    call install.bat
    if errorlevel 1 exit /b 1
)

echo Starting Vite frontend at http://localhost:5173 ...
echo Backend: deployed SOF gateway selected after login
npm run dev:react -- --host 0.0.0.0
