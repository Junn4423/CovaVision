@echo off
title ChamCong Mobile - Start on Android Device
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo.
echo ===========================================
echo   ChamCong Mobile - Android Dev Runner
echo ===========================================
echo.

if not exist "node_modules" (
    echo [INFO] node_modules not found. Running install.bat...
    call install.bat
    if errorlevel 1 exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    pause
    exit /b 1 
)

echo [CHECK] Verifying required npm packages...
call npm ls react-native-udp >nul 2>&1
if errorlevel 1 (
    echo [INFO] Missing react-native-udp. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed while adding react-native-udp.
        pause
        exit /b 1
    )
)

call npm ls buffer >nul 2>&1
if errorlevel 1 (
    echo [INFO] Missing buffer package. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed while adding buffer.
        pause
        exit /b 1
    )
)

call npm ls react-native-camera-kit >nul 2>&1
if errorlevel 1 (
    echo [INFO] Missing react-native-camera-kit. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed while adding react-native-camera-kit.
        pause
        exit /b 1
    )
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found.
    pause
    exit /b 1
)

if defined ANDROID_HOME set "PATH=%ANDROID_HOME%\platform-tools;%PATH%"
if defined ANDROID_SDK_ROOT set "PATH=%ANDROID_SDK_ROOT%\platform-tools;%PATH%"

where adb >nul 2>&1
if errorlevel 1 (
    echo [ERROR] adb not found.
    echo Install Android SDK Platform-Tools and add adb to PATH.
    pause
    exit /b 1
)

echo [1/4] Starting adb server...
adb start-server >nul 2>&1

set "DEVICE_ID="
set "UNAUTHORIZED_ID="
set "OFFLINE_ID="
set "MAX_RETRIES=8"

for /l %%R in (1,1,!MAX_RETRIES!) do (
    call :detect_device
    if defined DEVICE_ID goto device_ready

    if defined UNAUTHORIZED_ID (
        echo [WAIT %%R/!MAX_RETRIES!] Device !UNAUTHORIZED_ID! is unauthorized.
        echo             Unlock phone and tap Allow on USB debugging dialog.
    ) else (
        if defined OFFLINE_ID (
            echo [WAIT %%R/!MAX_RETRIES!] Device !OFFLINE_ID! is offline. Replug USB cable.
        ) else (
            echo [WAIT %%R/!MAX_RETRIES!] No Android device detected yet.
        )
    )

    if %%R LSS !MAX_RETRIES! timeout /t 2 >nul
)

echo [ERROR] No authorized Android device found after waiting.
echo.
echo Current adb devices output:
adb devices -l
echo.
echo Troubleshooting quick steps:
echo  1. On phone, set USB mode to File Transfer ^(MTP^), not Charge only.
echo  2. Reconnect cable and use a direct USB port on PC ^(no USB hub^).
echo  3. In Developer options: Revoke USB debugging authorizations, then reconnect.
echo  4. In Device Manager, ensure Android ADB driver is installed.
pause
exit /b 1

:device_ready

set "DEVICE_MODEL="
for /f "delims=" %%M in ('adb -s "!DEVICE_ID!" shell getprop ro.product.model 2^>nul') do (
    if not defined DEVICE_MODEL set "DEVICE_MODEL=%%M"
)
if not defined DEVICE_MODEL set "DEVICE_MODEL=Unknown"

echo [2/4] Using device: !DEVICE_ID! (!DEVICE_MODEL!)
echo [3/4] Setting adb reverse ports for dev...
adb -s "!DEVICE_ID!" reverse tcp:8081 tcp:8081 >nul 2>&1
adb -s "!DEVICE_ID!" reverse tcp:5000 tcp:5000 >nul 2>&1

echo [4/4] Starting Metro bundler in a new window (reset cache)...
start "ChamCong Mobile Metro" cmd /k "cd /d ""%~dp0"" && npm start -- --reset-cache"

echo.
echo Installing and launching debug app on phone...
timeout /t 3 >nul
call npx react-native run-android --deviceId "!DEVICE_ID!" --no-packager
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to run app on device.
    echo Check Java/Android SDK setup and Gradle output above.
    pause
    exit /b 1
)

echo.
echo ===========================================
echo   App launched in DEV mode.
echo ===========================================
echo.
echo Keep Metro window open while developing.
echo For full flow, start backend in chamcong_desktop-web.
echo Mobile config now uses backend-only:
echo   Backend API URL: http://localhost:5000
echo.
pause

goto :eof

:detect_device
set "DEVICE_ID="
set "UNAUTHORIZED_ID="
set "OFFLINE_ID="

for /f "skip=1 tokens=1,2" %%A in ('adb devices') do (
    if not "%%A"=="" (
        if /I "%%B"=="device" if not defined DEVICE_ID set "DEVICE_ID=%%A"
        if /I "%%B"=="unauthorized" if not defined UNAUTHORIZED_ID set "UNAUTHORIZED_ID=%%A"
        if /I "%%B"=="offline" if not defined OFFLINE_ID set "OFFLINE_ID=%%A"
    )
)

exit /b 0
