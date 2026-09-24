@echo off
setlocal
cd /d "%~dp0\.."

echo ========================================================
echo   MISHKAT Master Developer Support Hub ^& ngrok Tunnel
echo ========================================================
echo.

:: 1. Start Support Hub on port 4000 if not already listening
echo [1/3] Checking Master Support Hub on port 4000...
netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Starting Master Support Hub on port 4000...
    start "MISHKAT Support Hub (Port 4000)" cmd /k "node tools\developer-support-hub\index.cjs"
    timeout /t 2 /nobreak >nul
) else (
    echo [OK] Master Support Hub is running on port 4000.
)

:: 2. Start ngrok tunnel with static domain if not already running
echo.
echo [2/3] Checking ngrok tunnel with domain: calibrate-reply-aviation.ngrok-free.dev...
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I /N "ngrok.exe">NUL
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Starting ngrok tunnel...
    set "NGROK_BIN=bin\ngrok.exe"
    if not exist "%NGROK_BIN%" (
        set "NGROK_BIN=ngrok"
    )
    start "MISHKAT Support Tunnel (ngrok)" "%NGROK_BIN%" http --url=calibrate-reply-aviation.ngrok-free.dev 4000
    timeout /t 2 /nobreak >nul
) else (
    echo [OK] ngrok tunnel is already active.
)

:: 3. Open Support Dashboard in Browser
echo.
echo [3/3] Opening Support Dashboard in Chrome...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:4000"
) else (
    start "" "http://localhost:4000"
)

echo.
echo ========================================================
echo   MISHKAT Support System is Active and Listening!
echo   Public URL : https://calibrate-reply-aviation.ngrok-free.dev
echo   Local URL  : http://localhost:4000
echo   Admin Key  : mishkat_dev_admin_2026
echo ========================================================
echo.
timeout /t 2 /nobreak >nul
exit
