$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop "MISHKAT Support Dashboard.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "C:\projects\mishkat\scripts\launch-support-hub.bat"
$Shortcut.WorkingDirectory = "C:\projects\mishkat"
$Shortcut.IconLocation = "C:\projects\mishkat\src-tauri\icons\icon.ico, 0"
$Shortcut.Description = "MISHKAT Developer Support Server & Dashboard"
$Shortcut.Save()

Write-Host "Created shortcut successfully: $ShortcutPath"
