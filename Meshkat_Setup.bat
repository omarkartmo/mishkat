@echo off
chcp 65001 >nul
title مثبت برنامج مشكاة لإدارة المكتبات المدرسية - Meshkat Installer

echo =======================================================================
echo     مرحباً بك في معالج تثبيت برنامج مشكاة لإدارة المكتبات المدرسية
echo                   Meshkat School Library Setup Wizard
echo =======================================================================
echo.

:: 1. Check Station Role
echo [1/3] تحديد نمط تشغيل هذا الحاسوب في المدرسة:
echo -------------------------------------------------------------
echo  [1] حاسوب مركزي (خادم رئيسي لأمين المكتبة - Master Server)
echo  [2] حاسوب للطلبة والمستفيدين (محطة قراءة وبحث - Student Station)
echo -------------------------------------------------------------
set /p ROLE_CHOICE="اختر رقم النمط [1 أو 2] (الافتراضي 1): "

if "%ROLE_CHOICE%"=="2" (
    set STATION_ROLE=student
    set ROLE_NAME=محطة الطلبة والمستفيدين
) else (
    set STATION_ROLE=server
    set ROLE_NAME=الخادم المركزي للمكتبة
)
echo.
echo [✓] تم ضبط هذا الجهاز كـ: %ROLE_NAME%
echo.

:: 2. Target Directory
set INSTALL_DIR=%LOCALAPPDATA%\MeshkatLibrary
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: 3. Save config
(
echo {
echo   "stationRole": "%STATION_ROLE%",
echo   "installedDate": "%DATE% %TIME%",
echo   "version": "2.5.0"
echo }
) > "%INSTALL_DIR%\station_config.json"

:: 4. Create Desktop Shortcut Prompt
echo [2/3] إنشاء اختصار البرنامج على سطح المكتب:
echo -------------------------------------------------------------
set /p CREATE_SHORTCUT="هل تريد إنشاء اختصار على سطح المكتب؟ (Y/N - الافتراضي Y): "
if /I "%CREATE_SHORTCUT%"=="" set CREATE_SHORTCUT=Y
if /I "%CREATE_SHORTCUT%"=="Y" (
    echo جاري إنشاء الاختصار على سطح المكتب...
    powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'مشكاة للمكتبات المدرسية.lnk')); $Shortcut.TargetPath = 'cmd.exe'; $Shortcut.Arguments = '/c start \"\" \"%~dp0Launch_Meshkat.bat\"'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Description = 'برنامج مشكاة لإدارة المكتبات المدرسية'; $Shortcut.Save()"
    echo [✓] تم إنشاء الاختصار بنجاح على سطح المكتب!
)

:: 5. Launch Option
echo.
echo [3/3] اكتملت التهيئة والتثبيت بنجاح!
echo =======================================================================
echo.
set /p LAUNCH_NOW="هل ترغب في تشغيل برنامج مشكاة الآن؟ (Y/N - الافتراضي Y): "
if /I "%LAUNCH_NOW%"=="" set LAUNCH_NOW=Y
if /I "%LAUNCH_NOW%"=="Y" (
    start "" "%~dp0Launch_Meshkat.bat"
)
exit
