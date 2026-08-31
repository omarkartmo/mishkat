@echo off
chcp 65001 >nul
title إنشاء اختصار سطح المكتب - نظام المشكاة للمكتبات
color 0A

echo ===================================================
echo     نظام المشكاة لإدارة المكتبات المدرسية
echo     إنشاء اختصار رسمي على سطح المكتب
echo ===================================================
echo.

set SCRIPT_DIR=%~dp0
set TARGET_FILE=%SCRIPT_DIR%Mishkat-Server.bat
set SHORTCUT_NAME=نظام المشكاة للمكتبة.lnk

echo [1/2] جاري تجهيز الاختصار...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), '%SHORTCUT_NAME%')); $s.TargetPath = '%TARGET_FILE%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'نظام المشكاة لإدارة المكتبات المدرسية والمطالعة الأكاديمية'; $s.Save()"

if %errorlevel% equ 0 (
    echo [2/2] تم إنشاء الاختصار بنجاح على سطح المكتب!
    echo.
    echo يمكنك الآن تشغيل نظام المشكاة مباشرة من سطح المكتب.
) else (
    echo [!] تعذر إنشاء الاختصار تلقائياً، يمكنك النقر بزر الفأرة الأيمن على Mishkat-Server.bat واختيار Send to - Desktop.
)

echo.
pause
