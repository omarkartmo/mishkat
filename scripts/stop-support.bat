@echo off
setlocal
cd /d "%~dp0\.."

echo ========================================================
echo   Stopping MISHKAT Developer Support Hub ^& ngrok Tunnel
echo ========================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*developer-support-hub*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1

echo [OK] All Support Hub and ngrok processes stopped cleanly.
