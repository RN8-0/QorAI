Set WshShell = WScript.CreateObject("WScript.Shell")
If WshShell.AppActivate("Flutter-QorAI") Then
    WshShell.SendKeys "r"
Else
    MsgBox "Flutter çalışmıyor! Önce run.bat'i başlat.", 16, "Hot Reload"
End If
