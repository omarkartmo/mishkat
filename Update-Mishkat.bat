@echo off
chcp 65001 >nul
title تحديث نظام المشكاة للمكتبات المدرسية - Safe Production Update
color 0B

echo ===================================================
echo     نظام المشكاة لإدارة المكتبات المدرسية
echo     أداة التحديث البرمجي الآمن (Safe Production Update)
echo ===================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 1. التحقق من تشغيل خدمة ويندوز (في حال تم تثبيتها)
sc query MishkatLibraryService >nul 2>&1
if %errorlevel% equ 0 (
    echo [تنبيه] تم اكتشاف خدمة ويندوز نشطة (MishkatLibraryService).
    echo جاري إيقاف الخدمة مؤقتاً لتحديث الملفات...
    net stop MishkatLibraryService
    set "SERVICE_WAS_RUNNING=1"
    echo.
)

:: 2. جلب أحدث التحديثات البرمجية من المستودع
echo [1/4] فحص وجود تحديثات جديدة من المستودع المركزي...
if exist ".git" (
    echo [2/4] جلب أحدث التحسينات البرمجية عبر Git...
    git pull
    if %errorlevel% neq 0 (
        color 0C
        echo [خطأ] تعذر جلب التحديثات عبر Git. تأكد من اتصال الشبكة وعدم وجود تعديلات محلية متضاربة.
        pause
        exit /b 1
    )
) else (
    echo [!] لم يتم العثور على مستودع Git محلي (.git).
    echo إذا كنت تطبق تحديثاً تم تنزيله كملف ZIP، يرجى استبدال ملفات الشيفرة المصدرية مع الحفاظ على مجلد LibraryData وملف .env.
)

:: 3. تثبيت التبعيات المحدثة
echo.
echo [3/4] التحقق من الحزم وتحديث التبعيات (Dependencies)...
if exist "package-lock.json" (
    call npm ci
) else (
    call npm install
)

if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] فشل تثبيت التبعيات.
    pause
    exit /b 1
)

:: 4. إعادة تجميع وبناء ملفات الإنتاج (Production Build)
echo.
echo [4/4] جاري تجميع ملفات تطبيق الإنتاج المحدثة (Building updated production assets)...
call npm run build

if %errorlevel% neq 0 (
    color 0C
    echo [خطأ] فشلت عملية بناء وتجميع ملفات الإنتاج!
    echo لم يتم تطبيق التحديث بنجاح. يرجى مراجعة رسائل الأخطاء أعلاه.
    pause
    exit /b 1
)

:: 5. إعادة تشغيل الخدمة في حال كانت مشغلة
if defined SERVICE_WAS_RUNNING (
    echo.
    echo جاري إعادة تشغيل خدمة ويندوز (MishkatLibraryService)...
    net start MishkatLibraryService
)

echo.
echo ===================================================
echo     ✨ تمت عملية التحديث والبناء بنجاح تام!
echo     جميع ملفات الإنتاج محدثة ومطابقة لآخر إصدار.
echo ===================================================
echo.
pause
