@echo off
setlocal
cd /d "%~dp0\.."

echo ========================================================
echo   Launching MISHKAT Developer Support Server & Dashboard
echo ========================================================

:: Check if port 4000 is already listening
netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Support Server is already running on port 4000.
) else (
    echo [INFO] Starting Support Server on port 4000...
    start "MISHKAT Support Server (Port 4000)" cmd /k "node tools\support-server\index.cjs"
    timeout /t 2 /nobreak >nul
)

:: Open in Google Chrome
echo [INFO] Opening Dashboard in Google Chrome...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:4000"
) else (
    start chrome "http://localhost:4000" || start "" "http://localhost:4000"
)

timeout /t 2 /nobreak >nul
exit
