@echo off
chcp 65001 >nul
title تشغيل برنامج مشكاة للمكتبات المدرسية

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

call "%SCRIPT_DIR%Mishkat-Server.bat"
exit
