# ══════════════════════════════════════════════════════════════════
#  Qor AI — BU PC'Yİ OTOMASYON MAKİNESİ YAP (tek komut)
#
#  NEDEN VAR: Epey datacenter IP'lerini 403'lüyor, bu yüzden ürün ve TR
#  mağaza fiyatı çekme işleri EV IP'sinden koşmak zorunda. Şu an bu tek
#  PC'ye bağlı. PC bozulur / değişir / başka bir bilgisayara geçilirse
#  otomasyon durur. Bu script yeni makineyi ~2 dakikada devralır.
#
#  KULLANIM (yeni PC'de, repo klonlandıktan sonra):
#     powershell -ExecutionPolicy Bypass -File scripts\setup_qorai_pc.ps1
#
#  TEK ELLE ADIM: migration\.env dosyasını eski PC'den kopyalamak.
#  Gizli anahtarlar (PocketBase admin, Typesense, Coolify, Amazon tag'leri)
#  git'te TUTULMAZ. Eski PC ölmüşse: PB admin şifresi + Typesense anahtarı
#  Coolify ortam değişkenlerinde durur, oradan yeniden üretilir.
#
#  Parametreler:
#    -RepoPath <dir>  Repo kökü (varsayılan: bu scriptin üst klasörü)
#    -SkipInstall     npm install adımını atla
#    -Uninstall       tüm QorAI görevlerini kaldır
# ══════════════════════════════════════════════════════════════════
param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot),
  [switch]$SkipInstall,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
function Step($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }

if ($Uninstall) {
  foreach ($t in @('QorAI-PriceRefresh','QorAI-PriceDirect','QorAI-ProductDiscovery','QorAI-EpeyWatch','QorAI-FCM-TokenRefresh')) {
    try { Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction Stop; Write-Host "kaldirildi: $t" }
    catch { Write-Host "yok (atlandi): $t" }
  }
  return
}

$RepoPath = (Resolve-Path $RepoPath).Path
Write-Host "Qor AI PC kurulumu — repo: $RepoPath"

# ── 1. Ön koşullar ────────────────────────────────────────────────
Step '1/5 Ön koşullar'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node PATH'te yok. Node.js LTS kur: https://nodejs.org" }
Ok "node: $node ($(node -v))"

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
  throw 'curl.exe bulunamadi. Epey connector ve nabiz izleyicisi curl kullanir (Windows 10+ icinde gelir).'
}
Ok 'curl mevcut'

$envFile = Join-Path $RepoPath 'migration\.env'
if (-not (Test-Path $envFile)) {
  throw "migration\.env YOK. Eski PC'den kopyala — gizli anahtarlar git'te tutulmuyor. Bu dosya olmadan hicbir script PocketBase'e baglanamaz."
}
foreach ($k in @('POCKETBASE_URL','POCKETBASE_ADMIN_EMAIL','POCKETBASE_ADMIN_PASSWORD','TYPESENSE_URL','TYPESENSE_API_KEY')) {
  if (-not (Select-String -Path $envFile -Pattern "^$k=" -Quiet)) { throw "migration\.env icinde $k yok." }
}
Ok 'migration\.env eksiksiz'

# Chrome: scraper-proxy Cloudflare icin GERCEK tarayici kullanir (basssiz olamaz)
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Ok "tarayici: $chrome" } else { Warn 'Chrome/Edge bulunamadi — scraper-proxy Epey sayfalarini acamaz. Chrome kur.' }

# ── 2. Bagimliliklar ──────────────────────────────────────────────
Step '2/5 npm bagimliliklari'
if ($SkipInstall) { Warn 'atlandi (-SkipInstall)' }
else {
  Push-Location $RepoPath
  try { npm install --no-audit --no-fund 2>&1 | Select-Object -Last 3 | ForEach-Object { Write-Host "  $_" } }
  finally { Pop-Location }
  Ok 'kok bagimliliklari kuruldu'
}

# ── 3. PocketBase erisimi ─────────────────────────────────────────
# UYARIDIR, HATA DEGIL: PB gecici olarak 502 donebiliyor (Coolify redeploy
# sirasinda konteyner yeniden basliyor). Bu yuzden kurulumu iptal etmek YANLIS
# olur — gorevlerin kurulmasi PB'nin O ANDA ayakta olmasina bagli degil.
# (Yasandi 2026-08-05: PB redeploy sirasinda script adim 3'te durdu ve
# gorevleri hic kurmadi.) Uc kez denenir, yine olmazsa uyarip devam edilir.
Step '3/5 PocketBase erisimi'
$pbOk = $false
Push-Location (Join-Path $RepoPath 'migration')
try {
  foreach ($try in 1..3) {
    $probe = node -e "const pb=require('./pb.js');pb.req('GET','/api/collections/products/records?perPage=1&fields=id').then(r=>{console.log(r.status===200?'OK':'HTTP '+r.status);process.exit(r.status===200?0:1)}).catch(e=>{console.log('HATA '+e.message);process.exit(1)})" 2>&1
    if ($LASTEXITCODE -eq 0) { $pbOk = $true; break }
    Warn "deneme $try/3 basarisiz: $probe"
    if ($try -lt 3) { Start-Sleep -Seconds 10 }
  }
} finally { Pop-Location }
if ($pbOk) { Ok 'PocketBase erisimi calisiyor' }
else {
  Warn 'PocketBase su an erisilemiyor (gecici olabilir: Coolify deploy / ag).'
  Warn 'Gorevler yine de kuruluyor. Sonra dogrula:'
  Warn '   cd migration; node -e "require(''./pb.js'').req(''GET'',''/api/collections/products/records?perPage=1'').then(r=>console.log(r.status))"'
}

# ── 4. Ceviri worker'i (opsiyonel ama onerilir) ───────────────────
Step '4/5 Ceviri worker (GPU)'
$py = Join-Path $RepoPath 'scripts\translate-venv\Scripts\python.exe'
$model = Join-Path $RepoPath 'scripts\nllb-ct2'
if ((Test-Path $py) -and (Test-Path $model)) {
  Ok 'NLLB worker kurulu — kesif kosusu gerektiginde kendisi baslatir'
} else {
  Warn 'NLLB worker YOK. Ceviri yalnizca mevcut sozlukle yapilir; sozlukte'
  Warn 'olmayan atomlar TURKCE kalir. Kurmak icin (bir kez, ~2.5 GB):'
  Warn '   npm run translate:setup'
}

# ── 5. Zamanlanmis gorevler ───────────────────────────────────────
Step '5/5 Zamanlanmis gorevler'
foreach ($f in @('scripts\price_refresh.cmd','scripts\price_refresh_direct.cmd','scripts\product_discovery.cmd','scripts\epey_watch.cmd')) {
  if (-not (Test-Path (Join-Path $RepoPath $f))) { throw "$f bulunamadi — RepoPath yanlis olabilir: $RepoPath" }
}

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
  -MultipleInstances IgnoreNew

function Install-QorTask {
  param([string]$Name, $Action, $Trigger)
  # KOSAN gorevi yeniden kaydetme: Unregister onu ANINDA oldurur ve yarim
  # kalan bir scrape/fiyat kosusu urunleri puansiz/cevrilmemis birakir.
  $existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if ($existing -and $existing.State -eq 'Running') {
    Warn "$Name SU AN KOSUYOR — dokunulmadi. Kosu bitince tekrar calistir."
    return
  }
  try { Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction Stop } catch {}
  Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Settings $settings | Out-Null
  Ok "kuruldu: $Name"
}
function CmdAction([string]$rel) {
  New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$RepoPath\$rel`""
}

# 15 dk'da bir — Epey nabzi (yeni urun ANLIK yakalanir, tarama yok)
Install-QorTask 'QorAI-EpeyWatch' (CmdAction 'scripts\epey_watch.cmd') `
  (New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15))
# 23:20 — nabzin emniyet agi: kategori bazli en-yeni listesi + ceviri + puan
Install-QorTask 'QorAI-ProductDiscovery' (CmdAction 'scripts\product_discovery.cmd') `
  (New-ScheduledTaskTrigger -Daily -At '23:20')
# 03:10 — Epey -> Amazon.com.tr + TR magaza fiyatlari
Install-QorTask 'QorAI-PriceRefresh' (CmdAction 'scripts\price_refresh.cmd') `
  (New-ScheduledTaskTrigger -Daily -At '03:10')
# 03:12 — Amazon DE/GB/US ekstra kapasite
Install-QorTask 'QorAI-PriceDirect' (CmdAction 'scripts\price_refresh_direct.cmd') `
  (New-ScheduledTaskTrigger -Daily -At '03:12')

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Green
Write-Host " BU PC ARTIK OTOMASYON MAKINESI" -ForegroundColor Green
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Get-ScheduledTask QorAI-* | Select-Object TaskName, State | Format-Table -AutoSize
Write-Host @"
Loglar:
  %USERPROFILE%\qorai-epey-watch.log    nabiz (15 dk)
  %USERPROFILE%\qorai-discovery.log     gece kesfi (23:20)
  %USERPROFILE%\qorai-price.log         TR fiyat (03:10)
  %USERPROFILE%\qorai-price-direct.log  DE/GB/US fiyat (03:12)

Hemen test:
  node scripts\epey_watch.js --dry-run
  node scripts\auto_discover.js --categories=smart_rings

ESKI PC'DE otomasyonu kapatmak icin (iki makine ayni anda kosmasin):
  powershell -ExecutionPolicy Bypass -File scripts\setup_qorai_pc.ps1 -Uninstall
"@
