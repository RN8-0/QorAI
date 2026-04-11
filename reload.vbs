Set WshShell = WScript.CreateObject("WScript.Shell")
If WshShell.AppActivate("Flutter-Compair") Then
    WshShell.SendKeys "r"
Else
    MsgBox "Flutter çalışmıyor! Önce run.bat'i başlat.", 16, "Hot Reload"
End If
