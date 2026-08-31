@echo off
chcp 65001 >nul
title تشغيل برنامج مشكاة للمكتبات المدرسية

:: Check if build exists, otherwise run dev
if exist "dist\index.html" (
    echo جاري تشغيل مشكاة من الحزمة المحلية...
    start "" "dist\index.html"
) else (
    echo جاري بدء تشغيل خادم مشكاة المحلي...
    start cmd /c "npm run dev"
    timeout /t 3 >nul
    start http://localhost:3000
)
exit
