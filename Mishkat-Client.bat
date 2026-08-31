@echo off
chcp 65001 > nul
title نظام المشكاة لإدارة المكتبات المدرسية - محطة الطالب
color 0B

echo ================================================================
echo           نظام المشكاة لإدارة المكتبات المدرسية
echo             Mishkat Student Client Station
echo ================================================================
echo.

set "SERVER_IP="
if exist server_ip.txt (
    set /p SERVER_IP=<server_ip.txt
)

if "%SERVER_IP%"=="" (
    echo يرجى إدخال عنوان IP الخاص بحاسوب أمين المكتبة المركزي (مثال: 192.168.1.15):
    set /p SERVER_IP="العنوان: "
    echo %SERVER_IP%> server_ip.txt
)

echo.
echo جاري الاتصال بالخادم المركزي على: http://%SERVER_IP%:3000
echo.

:: فتح التطبيق في نمط النافذة المستقلة
start msedge.exe --app=http://%SERVER_IP%:3000 || start chrome.exe --app=http://%SERVER_IP%:3000 || start http://%SERVER_IP%:3000
exit
