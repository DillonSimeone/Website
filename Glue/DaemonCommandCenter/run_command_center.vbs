' run_command_center.vbs
' Launches Daemon Command Center silently into the Windows System Tray without a console window

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

localAppData = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")

' Locate pythonw.exe
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

args = ""
For i = 0 To WScript.Arguments.Count - 1
    args = args & " " & WScript.Arguments(i)
Next

command = """" & pythonwPath & """ """ & scriptDir & "\command_center.py""" & args
WshShell.Run command, 0, False
