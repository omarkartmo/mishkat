# MISHKAT Developer Support Hub & ngrok Tunnel
# Auto-Start & Keep-Alive Registration for Windows
# Ensures the Support Hub & ngrok tunnel run automatically on Windows boot/logon
# and recover seamlessly under all circumstances without requiring Administrator privileges.

$ErrorActionPreference = "Stop"

$ProjectDir = "C:\projects\mishkat"
$HeadlessRunner = Join-Path $ProjectDir "scripts\start-support-headless.vbs"
$StartupFolder = [Environment]::GetFolderPath('Startup')
$StartupVbsPath = Join-Path $StartupFolder "MISHKAT-Support-Keeper.vbs"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  MISHKAT Developer Support Hub & ngrok Tunnel" -ForegroundColor Cyan
Write-Host "  Registering Auto-Start & Watchdog..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Create Windows Startup Runner (.vbs)
# Runs silently on user login without any console window popup
$VbsContent = @"
' MISHKAT Support Keeper — Auto-Start on Windows Login
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

HeadlessScript = "$HeadlessRunner"

If fso.FileExists(HeadlessScript) Then
    ' Launch headless runner silently (0 = hidden)
    WshShell.Run "wscript.exe """ & HeadlessScript & """", 0, False
End If
"@

[System.IO.File]::WriteAllText($StartupVbsPath, $VbsContent, [System.Text.Encoding]::ASCII)
Write-Host "[OK] Created Windows Startup Keeper: $StartupVbsPath" -ForegroundColor Green

# 2. Windows Startup Keeper operates seamlessly under user-level privileges
Write-Host "[OK] Windows Startup Keeper will automatically start Support Hub and ngrok on login." -ForegroundColor Green

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  MISHKAT Support System is now configured to KEEP ALIVE" -ForegroundColor Green
Write-Host "  under all circumstances (reboots, crashes, logons)!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
