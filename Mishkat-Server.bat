@echo off
chcp 65001 > nul
title نظام المشكاة لإدارة المكتبات المدرسية - تشغيل الخادم المركزي (Production)
color 0A

:: 1. تثبيت مسار العمل للمجلد الحالي بأمان
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo           نظام المشكاة لإدارة المكتبات المدرسية
echo       Mishkat School Library Central Production Server
echo ================================================================
echo.

:: 2. التحقق من تثبيت بيئة تشغيل Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] بيئة تشغيل Node.js غير مثبتة على هذا الحاسوب!
    echo يرجى تحميل وتثبيت Node.js الإصدار 20 أو 22 (LTS) مجاناً من: https://nodejs.org
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] مدير الحزم npm غير متوفر في مسار النظام!
    pause
    exit /b 1
)

:: 3. التحقق من وجود ملف الإعدادات .env
if not exist ".env" (
    if exist ".env.example" (
        echo [تنبيه] ملف .env غير موجود. جاري إنشاء نسخة أولية من .env.example...
        copy ".env.example" ".env" >nul
        echo [مهم] يرجى تعديل قيمة JWT_SECRET في ملف .env بقيمة عشوائية سرية قوية (32 حرفاً على الأقل).
        echo.
    ) else (
        echo [تحذير] لم يتم العثور على ملف .env أو .env.example. يرجى التأكد من ضبط المتغيرات المطلوبة.
        echo.
    )
)

:: 4. التثبيت الأولي للمكتبات إذا لم تكن موجودة
if not exist "node_modules" (
    echo [1/3] جاري تثبيت الحزم والتبعيات لأول مرة، يرجى الانتظار قليلاً...
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [خطأ] فشل تثبيت المكتبات. يرجى التحقق من اتصال الإنترنت وحساب الصلاحيات.
        pause
        exit /b 1
    )
    echo.
)

:: 5. التحقق من تجميع ملفات الإنتاج المجمعة (Production Build)
if not exist "dist\server.cjs" (
    echo [2/3] جاري تجميع وبناء ملفات تطبيق الإنتاج (Building production bundle)...
    call npm run build
    if %errorlevel% neq 0 (
        color 0C
        echo [خطأ] فشل بناء ملفات الإنتاج.
        pause
        exit /b 1
    )
    echo.
)

:: 6. تحديد المنفذ (PORT) وعنوان IP المحلي على الشبكة
set "SERVER_PORT=3000"
if defined PORT (
    set "SERVER_PORT=%PORT%"
)

set "LOCAL_IP="
for /f "tokens=4" %%a in ('route print ^| findstr "\<0.0.0.0\>"') do (
    if not defined LOCAL_IP set "LOCAL_IP=%%a"
)
if not defined LOCAL_IP set "LOCAL_IP=localhost"

:: 7. عرض تعليمات الدخول للمكتبة والشبكة المحلية
cls
color 0A
echo ================================================================
echo        🚀 تم تشغيل الخادم المركزي لنظام المشكاة بنجاح (وضع الإنتاج)!
echo ================================================================
echo.
echo  [💻] للدخول من هذا الحاسوب المركزي (أمين المكتبة):
echo       http://localhost:%SERVER_PORT%
echo.
echo  [📱] للدخول من هواتف وأجهزة الحواسيب الأخرى (عبر شبكة المدرسة LAN):
echo       http://%LOCAL_IP%:%SERVER_PORT%
echo.
echo ================================================================
echo  * تأكد من اتصال الأجهزة الأخرى بنفس الشبكة المحلية (LAN / Wi-Fi).
echo  * تأكد من السماح للمنفذ %SERVER_PORT% عبر جدار حماية ويندوز (Windows Firewall).
echo  * سجلات النظام تُحفظ تلقائياً في: LibraryData\logs\mishkat.log
echo  * لا تغلق هذه النافذة أثناء فترات دوام واستخدام المكتبة.
echo ================================================================
echo.

:: 8. فتح المتصفح على الحاسوب المركزي تلقائياً بعد ثانيتين
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%SERVER_PORT%"

:: 9. بدء تشغيل خادم الإنتاج الفعلي (Node.js Production Server)
set NODE_ENV=production
node dist\server.cjs

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ================================================================
    echo [توقف] توقف الخادم المركزي برمز خطأ (%errorlevel%).
    echo يرجى مراجعة سجلات الأخطاء في: LibraryData\logs\mishkat.log
    echo ================================================================
    echo.
    pause
)
