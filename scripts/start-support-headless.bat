@echo off
setlocal
cd /d "%~dp0\.."

echo ========================================================
echo   MISHKAT Developer Support Hub ^& ngrok Tunnel
echo   Starting in Silent Background Mode...
echo ========================================================

:: Check if port 4000 is already active
netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Support Hub is already running on port 4000.
) else (
    echo [INFO] Launching background daemon...
    wscript.exe "%~dp0start-support-headless.vbs"
    ping 127.0.0.1 -n 3 >nul
    echo [OK] Background daemon launched.
)

echo.
echo Support Hub URL : http://localhost:4000
echo Public ngrok URL: https://calibrate-reply-aviation.ngrok-free.dev
echo.
