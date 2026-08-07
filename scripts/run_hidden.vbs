' Qor AI - bir komutu PENCERE ACMADAN calistirir.
'
' NEDEN: zamanlanmis gorev "Interactive" olarak kayitliyken cmd.exe her
' tetiklemede masaustunde konsol penceresi aciyor (kullanici: "pc acikken
' surekli karsima terminal ekrani geliyor"). Penceresiz calisma normalde
' LogonType S4U ile yapilir ama o YONETICI IZNI ister ve Register-ScheduledTask
' "Erisim engellendi" veriyor. wscript + WindowStyle 0 ayni sonucu YONETICISIZ
' verir.
'
' Kullanim:  wscript.exe //B run_hidden.vbs "C:\...\weekly_maintenance.cmd"
' 3. parametre True ise komut bitene kadar bekler (gorev "calisiyor" gorunsun).
Option Explicit
Dim shell, cmd, i, args
Set args = WScript.Arguments
If args.Count < 1 Then WScript.Quit 2

cmd = """" & args(0) & """"
For i = 1 To args.Count - 1
  cmd = cmd & " """ & args(i) & """"
Next

Set shell = CreateObject("WScript.Shell")
' 0 = pencere gizli, True = surec bitene kadar bekle (zamanlayici sureyi dogru
' olcsun ve MultipleInstances=IgnoreNew gercekten ust uste binmeyi engellesin).
WScript.Quit shell.Run("cmd.exe /c " & cmd, 0, True)
