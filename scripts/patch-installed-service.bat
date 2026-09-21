@echo off
:: BatchGotAdmin
:-------------------------------------
REM --> Check for permissions
IF "%PROCESSOR_ARCHITECTURE%" EQU "amd64" (
>nul 2>&1 "%SYSTEMROOT%\SysWOW64\cacls.exe" "%SYSTEMROOT%\SysWOW64\config\system"
) ELSE (
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
)

REM --> If error flag set, we do not have admin.
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    set params= %*
    echo UAC.ShellExecute "cmd.exe", "/c ""%~s0"" %params%", "", "runas", 1 >> "%temp%\getadmin.vbs"

    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    pushd "%CD%"
    CD /D "%~dp0\.."
:--------------------------------------

echo ========================================================
echo   Updating Mishkat Service with Full v1.1.4 Suite
echo ========================================================

echo [1/4] Stopping MishkatLibraryService...
net stop MishkatLibraryService
timeout /t 3 /nobreak >nul

echo [2/4] Deploying complete frontend and server dist to C:\Program Files\MISHKAT\dist...
if not exist "C:\Program Files\MISHKAT\dist" mkdir "C:\Program Files\MISHKAT\dist"
xcopy /E /I /Y "dist" "C:\Program Files\MISHKAT\dist"

echo [3/4] Deploying package.json and migrations...
copy /Y "package.json" "C:\Program Files\MISHKAT\package.json"
copy /Y "package-lock.json" "C:\Program Files\MISHKAT\package-lock.json"
if exist "server\db\migrations" xcopy /E /I /Y "server\db\migrations" "C:\Program Files\MISHKAT\server\db\migrations"

echo [4/4] Starting MishkatLibraryService...
net start MishkatLibraryService

echo ========================================================
echo   Done! Mishkat Central Server is now updated to v1.1.4.
echo ========================================================
timeout /t 5
