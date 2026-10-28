' Start-AudioHaptics.vbs
' Launches audio_haptics_daemon.py silently without a visible console window

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

localAppData = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")

pythonwPath = "pythonw.exe"
candidates = Array(_
    localAppData & "\Programs\Python\Python310\pythonw.exe",_
    localAppData & "\Programs\Python\Python311\pythonw.exe",_
    localAppData & "\Programs\Python\Python312\pythonw.exe",_
    localAppData & "\Programs\Python\Python313\pythonw.exe",_
    "C:\Python310\pythonw.exe",_
    "pythonw.exe"_
)

For Each p In candidates
    If FSO.FileExists(p) Then
        pythonwPath = p
        Exit For
    End If
Next

command = """" & pythonwPath & """ """ & scriptDir & "\audio_haptics_daemon.py"""
WshShell.Run command, 0, False
