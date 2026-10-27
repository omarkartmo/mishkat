' MISHKAT Developer Support Hub & ngrok Tunnel — Silent Background Runner
' Runs node tools\developer-support-hub\index.cjs without any visible console window

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ProjectDir = fso.GetParentFolderName(ScriptDir)

WshShell.CurrentDirectory = ProjectDir

' Run silently (WindowStyle 0 = hidden, WaitOnReturn = False)
WshShell.Run "cmd /c node tools\developer-support-hub\index.cjs", 0, False
