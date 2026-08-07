# Qor AI - zamanlanmis isleri HAFTALIK tek zincire cevirir ve PENCERESIZ yapar.
#
# NEDEN (2026-08-07, kullanici istegi + olcum):
#  * "otomasyon islemlerini gunluk degil HAFTALIK olarak ayarla"
#  * "pc acikken surekli karsima terminal ekrani geliyor" -> gorevler
#    Interactive olarak tanimliydi, her tetiklemede konsol penceresi aciliyordu.
#    QorAI-EpeyWatch 15 dk'da bir, QorAI-FCM-TokenRefresh 50 dk'da bir kosuyordu.
#  * QorAI-FCM-TokenRefresh TAMAMEN GEREKSIZ: Hetzner'de zaten
#    "*/50 * * * * /root/refresh-fcm-token.sh" cron'u var ve calisiyor
#    (dogrulandi: 2026-08-07 23:00:04'te token yenilendi). PC'deki kopya
#    yalnizca pencere aciyordu.
#
# SONUC: tek gorev (QorAI-Weekly), Pazar 02:00, penceresiz.
# Kacirilirsa PC acilinca kosar (StartWhenAvailable).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$weekly = Join-Path $root 'scripts\weekly_maintenance.cmd'
if (-not (Test-Path $weekly)) { throw "bulunamadi: $weekly" }

# 1) Eski gorevleri kaldir -----------------------------------------------
$old = @('QorAI-EpeyWatch', 'QorAI-PriceRefresh', 'QorAI-PriceDirect',
         'QorAI-ProductDiscovery', 'QorAI-FCM-TokenRefresh')
foreach ($name in $old) {
  $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($t) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "kaldirildi: $name"
  }
}

# 2) Haftalik gorev -------------------------------------------------------
# PENCERESIZ CALISMA: normalde LogonType S4U kullanilir ama o YONETICI izni
# ister (olculdu: Register-ScheduledTask -> "Erisim engellendi"). Yoneticisiz
# cozum: eylem cmd.exe degil wscript.exe olsun ve run_hidden.vbs komutu
# WindowStyle 0 ile baslatsin. //B = wscript'in kendi uyari pencerelerini de
# bastirir. Boylece masaustunde HICBIR konsol penceresi acilmaz.
$vbs = Join-Path $root 'scripts\run_hidden.vbs'
if (-not (Test-Path $vbs)) { throw "bulunamadi: $vbs" }

$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument "//B //Nologo `"$vbs`" `"$weekly`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 02:00
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 20) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName 'QorAI-Weekly' -Action $action -Trigger $trigger `
  -Settings $settings -Force | Out-Null
Write-Host 'kuruldu: QorAI-Weekly (Pazar 02:00, penceresiz, 20 sa sinir)'

$t = Get-ScheduledTask -TaskName 'QorAI-Weekly'
Write-Host ("  tetik     : " + (($t.Triggers | ForEach-Object { $_.StartBoundary }) -join ','))
Write-Host ("  eylem     : " + (($t.Actions  | ForEach-Object { $_.Execute })      -join ','))
Write-Host ("  logonTipi : " + $t.Principal.LogonType)
