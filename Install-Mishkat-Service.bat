@echo off
chcp 65001 > nul
title تثبيت خدمة ويندوز - Mishkat Windows Service Installer (NSSM)
color 0B

echo ================================================================
echo       تثبيت نظام المشكاة كخدمة تشغيل تلقائي في ويندوز
echo       Mishkat School Library Windows Service Setup (NSSM)
echo ================================================================
echo.

:: 1. التحقق من تشغيل السكربت كمسؤول (Administrator Privileges)
net session >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] يتطلب تثبيت خدمة ويندوز تشغيل موجه الأوامر بصلاحيات المسؤول (Run as Administrator).
    echo يرجى النقر بزر الفأرة الأيمن على الملف واختيار "تشغيل كمسؤول".
    echo.
    pause
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "PROJECT_DIR=%CD%"

:: 2. التحقق من توفر أداة NSSM
set "NSSM_EXE=nssm.exe"
where nssm >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%PROJECT_DIR%\nssm.exe" (
        set "NSSM_EXE=%PROJECT_DIR%\nssm.exe"
    ) else (
        color 0C
        echo [خطأ] لم يتم العثور على أداة NSSM (Non-Sucking Service Manager)!
        echo.
        echo لتشغيل النظام كخدمة ذاتية التشغيل في ويندوز:
        echo  1. قم بتحميل أداة NSSM المجانية من: https://nssm.cc/download
        echo  2. فك الضغط وانسخ ملف nssm.exe إلى مجلد المشروع هذا:
        echo     %PROJECT_DIR%
        echo  3. أو أضف مجلد nssm إلى متغيرات بيئة النظام (PATH).
        echo.
        pause
        exit /b 1
    )
)

:: 3. التحقق من توفر Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] لم يتم العثور على Node.js! تأكد من تثبيته وإضافته لمسار النظام.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('where node') do set "NODE_EXE=%%i"

:: 4. التحقق من بناء وتجميع ملفات الإنتاج
if not exist "%PROJECT_DIR%\dist\server.cjs" (
    echo [تنبيه] لم يتم العثور على ملفات الإنتاج المجمعة dist\server.cjs.
    echo جاري تجميع وبناء ملفات الإنتاج أولاً...
    call npm run build
    if %errorlevel% neq 0 (
        color 0C
        echo [خطأ] فشل بناء ملفات الإنتاج.
        pause
        exit /b 1
    )
)

:: 5. التحقق من مجلد السجلات
if not exist "%PROJECT_DIR%\LibraryData\logs" (
    mkdir "%PROJECT_DIR%\LibraryData\logs"
)

:: 6. تثبيت وتهيئة الخدمة عبر NSSM
set "SERVICE_NAME=MishkatLibraryService"

echo.
echo [1/3] جاري تثبيت خدمة ويندوز (%SERVICE_NAME%)...
"%NSSM_EXE%" install "%SERVICE_NAME%" "%NODE_EXE%" "dist\server.cjs"
if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] فشل تثبيت الخدمة. قد تكون الخدمة مثبتة مسبقاً.
    echo لإزالتها أولاً قم بتشغيل: Uninstall-Mishkat-Service.bat
    pause
    exit /b 1
)

echo [2/3] ضبط معلمات التشغيل التلقائي والأمان...
"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%PROJECT_DIR%"
"%NSSM_EXE%" set "%SERVICE_NAME%" DisplayName "Mishkat School Library Central Server"
"%NSSM_EXE%" set "%SERVICE_NAME%" Description "Central LAN Server for Mishkat School Library Management System"
"%NSSM_EXE%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRestartDelay 5000
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%PROJECT_DIR%\LibraryData\logs\service-stdout.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%PROJECT_DIR%\LibraryData\logs\service-stderr.log"

echo [3/3] جاري بدء تشغيل الخدمة...
"%NSSM_EXE%" start "%SERVICE_NAME%"

echo.
echo ================================================================
echo    ✨ تم تثبيت خدمة نظام المشكاة بنجاح تام!
echo    - اسم الخدمة: %SERVICE_NAME%
echo    - نمط التشغيل: تلقائي عند إقلاع ويندوز (SERVICE_AUTO_START)
echo    - إعادة التشغيل التلقائي: مفعلة عند حدوث أي توقف (Delay: 5000ms)
echo    - ملفات السجل: LibraryData\logs\
echo ================================================================
echo.
echo يمكنك التحقق من حالة الخدمة عبر: nssm status %SERVICE_NAME%
echo أو عبر إدارة الخدمات في ويندوز (services.msc).
echo.
pause
