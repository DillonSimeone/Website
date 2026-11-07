' Silently launch the Pixel Auto Tethering Daemon without showing a console window
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

userProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")
localAppData = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")

' Check candidate pythonw paths
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

command = """" & pythonwPath & """ """ & scriptDir & "\auto_tether.py"""

' 0 = Hide window, False = Don't wait for script to exit
returnCode = WshShell.Run(command, 0, False)
