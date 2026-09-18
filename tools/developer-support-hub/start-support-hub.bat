@echo off
chcp 65001 > nul
title مركز الدعم الفني للمطور - MISHKAT Developer Support Hub
color 09

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ========================================================
echo        نظام المشكاة لإدارة المكتبات المدرسية
echo       MISHKAT Developer Support Hub & Dashboard
echo ========================================================
echo.

node index.js
pause
