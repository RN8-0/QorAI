# ══════════════════════════════════════════════════════════════════
#  Qor AI — fiyat görevlerini YENİ PC'ye kuran script
#
#  2026-08-24: FİYATIN TEK KOŞUCUSU ARTIK BU PC. Amazon, Hetzner'ın
#  datacenter IP'sine dört pazarda birden bot duvarı çıkarmaya başladı
#  (gece koşusu 291 → 19 teklif); oradaki 03:10 ve 15:10 cron'ları
#  yoruma alındı. Hetzner'da yalnız SEO ön-render (04:17) ve FCM token
#  kaldı. PC uzun süre kapalı kalırsa fiyatlar bayatlar ve kartlarda
#  GİZLENİR — ayrıntı: docs/PRICE_PIPELINE.md
#
#  İKİ PC ÇAKIŞMAZ: .cmd zincirleri koşmadan önce PocketBase'deki işçi
#  kiralamasına bakar (scripts/worker_lease.js). Sahibi hayattaki başka
#  bir PC ise koşu sessizce atlanır; sahip 26 saattir görünmüyorsa bu PC
#  kendiliğinden devralır.
#
#  Yeni PC'ye taşınma (tam adımlar docs/PRICE_PIPELINE.md):
#    1. Repoyu klonla (veya kopyala)
#    2. migration\.env dosyasını ESKİ PC'den kopyala (gizli anahtarlar
#       git'te YOK — bu dosya olmadan hiçbir script PB'ye bağlanamaz)
#    3. Node.js kur (node PATH'te olmalı), repo kökünde `npm install`
#    4. Bu scripti çalıştır:
#       powershell -ExecutionPolicy Bypass -File scripts\setup_price_tasks.ps1
#
#  Parametreler:
#    -RepoPath <dir>   Repo kökü (varsayılan: bu scriptin üst klasörü)
#    -IncludeFcm       FCM token görevini de kur (Hetzner'da zaten var;
#                      yalnız yedeklilik istenirse)
#    -Uninstall        Görevleri kaldır
# ══════════════════════════════════════════════════════════════════
param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
  [switch]$IncludeFcm,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$tasks = @('QorAI-PriceRefresh', 'QorAI-PriceDirect', 'QorAI-ProductDiscovery', 'QorAI-EpeyWatch')
if ($IncludeFcm -or $Uninstall) { $tasks += 'QorAI-FCM-TokenRefresh' }

if ($Uninstall) {
  foreach ($t in $tasks) {
    try { Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction Stop; Write-Host "kaldirildi: $t" }
    catch { Write-Host "yok (atlandi): $t" }
  }
  return
}

# ── ön kontroller ──────────────────────────────────────────────────
$RepoPath = (Resolve-Path $RepoPath).Path
if (-not (Test-Path (Join-Path $RepoPath 'scripts\price_refresh.cmd'))) {
  throw "scripts\price_refresh.cmd bulunamadi — RepoPath yanlis: $RepoPath"
}
if (-not (Test-Path (Join-Path $RepoPath 'scripts\product_discovery.cmd'))) {
  throw "scripts\product_discovery.cmd bulunamadi — RepoPath yanlis: $RepoPath"
}
if (-not (Test-Path (Join-Path $RepoPath 'migration\.env'))) {
  throw "migration\.env YOK. Eski PC'den kopyala (gizli anahtarlar git'te tutulmuyor)."
}
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node PATH''te bulunamadi — Node.js kur.' }
try { $null = Get-Command curl.exe } catch { throw 'curl bulunamadi (Epey connector curl kullanir; Windows 10+ icinde vardir).' }

# ── ortak ayarlar: kaçırılan koşu açılışta telafi edilir, pil engel değil,
#    12 saat limit, üst üste tetiklenirse yenisi atlanır ──────────────
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
  -MultipleInstances IgnoreNew

function Install-QorTask {
  param([string]$Name, [Microsoft.Management.Infrastructure.CimInstance]$Action, [Microsoft.Management.Infrastructure.CimInstance[]]$Trigger, $TaskSettings)
  try { Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction Stop } catch {}
  Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Settings $TaskSettings | Out-Null
  Write-Host "kuruldu: $Name"
}

# 03:10 — Epey→Amazon.com.tr TR zinciri (price_refresh.cmd)
Install-QorTask -Name 'QorAI-PriceRefresh' `
  -Action  (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$RepoPath\scripts\price_refresh.cmd`"") `
  -Trigger (New-ScheduledTaskTrigger -Daily -At '03:10') `
  -TaskSettings $settings

# 03:12 — Amazon.de/.co.uk/.com direct zinciri (price_refresh_direct.cmd)
Install-QorTask -Name 'QorAI-PriceDirect' `
  -Action  (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$RepoPath\scripts\price_refresh_direct.cmd`"") `
  -Trigger (New-ScheduledTaskTrigger -Daily -At '03:12') `
  -TaskSettings $settings

# 23:20 — YENİ ÜRÜN KEŞFİ: Epey'e eklenen ürünler katalog + çeviri + puan
# + fiyat olarak siteye kendiliğinden girer (scripts\product_discovery.cmd).
# Saat neden 23:20? Koşu --max-hours=3 ile sınırlı; 03:10'daki fiyat göreviyle
# aynı anda epey.com'a yüklenirse Epey oturumu yanıyor.
Install-QorTask -Name 'QorAI-ProductDiscovery' `
  -Action  (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$RepoPath\scripts\product_discovery.cmd`"") `
  -Trigger (New-ScheduledTaskTrigger -Daily -At '23:20') `
  -TaskSettings $settings

# 15 dk'da bir — EPEY NABZI. Epey ana sayfasındaki kategori bağımsız
# "Son Eklenen Ürünler" bloğunu TEK istekle okur (~1 sn). Katalogda olmayan
# ürün yoksa hiçbir şey başlatmaz; varsa yalnız o adresleri çeker.
# TARAMA YAPMAZ — gece 23:20'deki ProductDiscovery emniyet ağıdır.
$watchTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15)
Install-QorTask -Name 'QorAI-EpeyWatch' `
  -Action  (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$RepoPath\scripts\epey_watch.cmd`"") `
  -Trigger $watchTrigger `
  -TaskSettings $settings

if ($IncludeFcm) {
  # 50 dk'da bir FCM access token yenileme. Hetzner cron'u (*/50) bunu zaten
  # yapıyor — bu görev yalnız yedeklilik içindir, çift koşması zararsızdır
  # (aynı app_config kaydına idempotent yazar).
  $fcmTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 50)
  Install-QorTask -Name 'QorAI-FCM-TokenRefresh' `
    -Action  (New-ScheduledTaskAction -Execute $node -Argument "`"$RepoPath\migration\refresh_fcm_token.js`"" -WorkingDirectory (Join-Path $RepoPath 'migration')) `
    -Trigger $fcmTrigger `
    -TaskSettings $settings
}

Write-Host ''
Write-Host 'Tamam. Dogrulama:'
Write-Host '  Get-ScheduledTask QorAI-* | Get-ScheduledTaskInfo'
Write-Host "  Ilk kosudan sonra log: $env:USERPROFILE\qorai-price.log ve qorai-price-direct.log"
Write-Host "  Yeni urun kesfi logu : $env:USERPROFILE\qorai-discovery.log"
