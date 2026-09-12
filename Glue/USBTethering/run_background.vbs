' Silently launch the Pixel Auto Tethering Daemon without showing a console window
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Try pythonw.exe first (GUI python runner, zero console flash)
pythonwPath = "pythonw.exe"
command = """" & pythonwPath & """ """ & scriptDir & "\auto_tether.py"""

' 0 = Hide window, False = Don't wait for script to exit
returnCode = WshShell.Run(command, 0, False)
