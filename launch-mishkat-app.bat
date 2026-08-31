@echo off
chcp 65001 > nul
title نظام المشكاة لإدارة المكتبات المدرسية - إطلاق التطبيق المكتبي
color 0B

echo ========================================================
echo        نظام المشكاة لإدارة المكتبات المدرسية 
echo       Mishkat School Library Desktop Launcher
echo ========================================================
echo.

:: 1. التحقق من وجود عنوان الخادم المركزي
set SERVER_IP=localhost
if exist server_ip.txt (
    set /p SERVER_IP=<server_ip.txt
)

echo [1/2] جاري الاتصال بالخادم المركزي على: http://%SERVER_IP%:3000
echo.

:: 2. تشغيل التطبيق في وضع التطبيق المقفل (Controlled App Mode)
:: يفحص المتصفحات المثبتة ويفتح التطبيق في نافذة مستقلة تماماً بدون شريط عناوين
start msedge.exe --app=http://%SERVER_IP%:3000 --window-size=1280,800 || start chrome.exe --app=http://%SERVER_IP%:3000 --window-size=1280,800 || start brave.exe --app=http://%SERVER_IP%:3000

echo [2/2] تم فتح نظام المشكاة بنجاح في نافذة مستقلة ومحمية!
timeout /t 3 > nul
exit
