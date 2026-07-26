@echo off
rem Qor AI — nightly TR price refresh (epey_amazon connector).
rem Runs on this PC (residential IP) because Epey 403-blocks datacenter IPs —
rem the Hetzner box cannot fetch epey.com. Scheduled task: QorAI-PriceRefresh.
rem NOT: PB bu kurulumda coklu sort'u ("a,-b") 400'ler — her pass TEKLI sort kullanir.
rem
rem 2026-07-26 KOK NEDEN DUZELTMESI — "fiyatlar yok" sikayetinin gercek sebebi:
rem   Connector eskiden YALNIZ Amazon.com.tr satirini yaziyordu. Epey sayfasinda
rem   Amazon yoksa urun fiyatsiz kaliyor, ama rollup yine de bestOfferCheckedAt
rem   damgasi basiyordu. Kesif pass'leri "bestOfferCheckedAt=''" (hic taranmamis)
rem   filtresi kullandigi icin bu urunler bir daha ASLA kesfe girmiyordu; yalnizca
rem   300/gece limitli recheck pass'i dokunuyordu. Olcum: 31.901 urunun Epey'de
rem   fiyati VAR ama sitede YOKTU (31.901 / 300 = 106 gece).
rem   Connector artik en ucuz 3 magazayi da yaziyor, yani bu havuzun buyuk kismi
rem   TEK taramada fiyat kazanir. Kesif filtresinden "bestOfferCheckedAt=''"
rem   sarti KALDIRILDI ve siralama en-eski-once yapildi (dogal rotasyon).
rem
rem DE/GB/US (amazon_direct) BU ZINCIRDE DEGIL — ayri gorevde paralel kosar:
rem QorAI-PriceDirect -> scripts\price_refresh_direct.cmd (epey.com ile host
rem cakismasi yok).
cd /d C:\Users\RN8\Desktop\Compair-master
echo ===== %date% %time% price refresh start ===== >> "%USERPROFILE%\qorai-price.log"
set NO_REINDEX=1
rem pass1 — refresh: fiyat gosteren her urunu yenile (en eski kontrol once)
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount>0" --sort=bestOfferCheckedAt --limit=4000 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass2 — KESIF (asil kazanc): Epey'de fiyati olan ama sitede fiyatsiz her urun.
rem En eski taranan once -> havuz her gece basa donmeden sirayla tamamen taranir.
rem Varyantlar dahil (iPhone 1 TB gibi populer varyant sayfalari).
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount<1 && price_raw!=''" --sort=bestOfferCheckedAt --limit=6000 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass2b — YENI urunler: hic taranmamislar once (katalog buyudukce bunlar gelir)
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt=''" --sort=-techScore --limit=800 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass3 — Epey'de fiyati DA olmayanlar: dusuk ihtimal, kucuk kota, en eski once
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1 && price_raw=''" --sort=bestOfferCheckedAt --limit=300 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
set NO_REINDEX=
rem TS backfill: fiyatlar PB'de birikip siteye yansimadan kalmasin (2026-07-04
rem regresyonu). Direct gorev de kendi sonunda bir tane kosar — idempotent.
node scripts\ts_backfill_lowest_price.js --confirm >> "%USERPROFILE%\qorai-price.log" 2>&1
echo ===== %date% %time% price refresh done ===== >> "%USERPROFILE%\qorai-price.log"
