' Start-Sentinel.vbs
' Launches Watch-PhoneWifi5G.ps1 silently without a visible console window

Set WshShell = CreateObject("WScript.Shell")
strCurDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
strCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File """ & strCurDir & "\Watch-PhoneWifi5G.ps1"""
WshShell.Run strCmd, 0, False
