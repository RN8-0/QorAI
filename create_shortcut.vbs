Set ws = WScript.CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repoPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Hot Reload kısayolu
Set s1 = ws.CreateShortcut("C:\Users\RN8\Desktop\Hot Reload.lnk")
s1.TargetPath = repoPath & "\reload.vbs"
s1.IconLocation = "C:\Windows\System32\shell32.dll,238"
s1.Description = "Flutter Hot Reload"
s1.Save()

' Flutter Run kısayolu
Set s2 = ws.CreateShortcut("C:\Users\RN8\Desktop\Flutter Run.lnk")
s2.TargetPath = repoPath & "\run.bat"
s2.IconLocation = "C:\Windows\System32\shell32.dll,137"
s2.Description = "Flutter Run (Qor AI)"
s2.Save()

WScript.Echo "Kısayollar hazır!"
