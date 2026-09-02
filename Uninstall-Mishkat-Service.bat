@echo off
chcp 65001 > nul
title إزالة خدمة ويندوز - Mishkat Windows Service Uninstaller
color 0C

echo ================================================================
echo       إزالة خدمة نظام المشكاة من نظام تشغيل ويندوز
echo       Mishkat School Library Windows Service Removal
echo ================================================================
echo.

:: 1. التحقق من تشغيل السكربت كمسؤول (Administrator Privileges)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [خطأ] يتطلب إلغاء تثبيت الخدمة تشغيل موجه الأوامر بصلاحيات المسؤول (Run as Administrator).
    echo يرجى النقر بزر الفأرة الأيمن على الملف واختيار "تشغيل كمسؤول".
    echo.
    pause
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "NSSM_EXE=nssm.exe"
where nssm >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%SCRIPT_DIR%nssm.exe" (
        set "NSSM_EXE=%SCRIPT_DIR%nssm.exe"
    ) else (
        echo [خطأ] لم يتم العثور على أداة nssm.exe في مسار النظام أو في مجلد المشروع.
        pause
        exit /b 1
    )
)

set "SERVICE_NAME=MishkatLibraryService"

echo [1/2] إيقاف الخدمة في حال كانت قيد التشغيل...
"%NSSM_EXE%" stop "%SERVICE_NAME%" >nul 2>&1

echo [2/2] إزالة الخدمة من سجلات ويندوز...
"%NSSM_EXE%" remove "%SERVICE_NAME%" confirm

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo ================================================================
    echo    ✨ تم إلغاء تثبيت خدمة (%SERVICE_NAME%) بنجاح.
    echo ================================================================
) else (
    echo.
    echo [تنبيه] قد تكون الخدمة غير مثبتة مسبقاً أو تم حذفها بالفعل.
)

echo.
pause
