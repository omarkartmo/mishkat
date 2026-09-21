@echo off
chcp 65001 > nul
title MISHKAT Master Support Receiver - Developer PC
color 0b

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ========================================================
echo   MISHKAT Support API (Master Receiver) - Developer PC
echo   Local SQLite Storage ^& Direct Error Reporting
echo ========================================================
echo.

node index.cjs
pause
