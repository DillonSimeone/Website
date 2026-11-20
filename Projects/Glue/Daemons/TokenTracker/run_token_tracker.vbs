' run_token_tracker.vbs
' Launches LLM Token Tracker silently in the background

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

localAppData = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
pythonwPath = localAppData & "\Programs\Python\Python310\pythonw.exe"
If Not FSO.FileExists(pythonwPath) Then pythonwPath = "pythonw.exe"
WshShell.Run """" & pythonwPath & """ """ & scriptDir & "\main.py"" --headless", 0, False
