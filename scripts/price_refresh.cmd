@echo off
rem Qor AI — nightly Amazon.com.tr price refresh (epey_amazon connector).
rem Runs on this PC (residential IP) because Epey 403-blocks datacenter IPs —
rem the Hetzner box cannot fetch epey.com. Scheduled task: QorAI-PriceRefresh.
rem Pass 1 refreshes every currently-priced product (oldest check first);
rem pass 2 expands coverage (never-checked flagships first); then one TS backfill.
rem NOT: PB bu kurulumda coklu sort'u ("a,-b") 400'ler — her pass TEKLI sort kullanir.
rem
rem DE/GB/US (amazon_direct) BU ZINCIRDE DEGIL: pass5 olarak en sondaydi ve
rem gunduz kill edilen koroda hicbir gece bitemiyordu — sondaki TS backfill de
rem hic calismadigi icin PB'de biriken fiyatlar siteye YANSIMIYORDU (2.807 PB
rem vs 123 TS, 2026-07-04). Simdi ayri gorevde paralel kosuyor:
rem QorAI-PriceDirect → scripts\price_refresh_direct.cmd (epey.com ile host
rem cakismasi yok).
cd /d C:\Users\RN8\Desktop\Compair-master
echo ===== %date% %time% price refresh start ===== >> "%USERPROFILE%\qorai-price.log"
set NO_REINDEX=1
rem pass1 — refresh: fiyat gosteren her urunu yenile (en eski kontrol once)
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount>0" --sort=bestOfferCheckedAt --limit=4000 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass2 — discovery: hic taranmamislar; once Epey'de fiyati OLANLAR (Amazon olasiligi yuksek) + yuksek techScore
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt='' && price_raw!=''" --sort=-techScore --limit=6000 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass2b — discovery (kalanlar): Epey fiyatsizlar dahil genel tarama
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt=''" --sort=-techScore --limit=500 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass2c — VARYANTLAR: variantPrimary=false kayitlar default filtrede TAMAMEN atlaniyordu
rem (iPhone 1TB gibi populer varyant sayfalari fiyatsiz kaliyordu) — Epey fiyatli varyantlari tara
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=variantPrimary=false && pricedOfferCount<1 && bestOfferCheckedAt='' && price_raw!=''" --sort=-techScore --limit=800 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass3 — recheck: daha once bakilmis ama fiyatsiz kalanlari arada yeniden dene
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt!=''" --sort=bestOfferCheckedAt --limit=300 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
set NO_REINDEX=
rem TS backfill: bu zincir artik ~3.5 saatte bitiyor, yani backfill HER GUN calisir
rem (direct gorev de kendi sonunda bir tane kosar — idempotent, cift kosmasi zararsiz).
node scripts\ts_backfill_lowest_price.js --confirm >> "%USERPROFILE%\qorai-price.log" 2>&1
echo ===== %date% %time% price refresh done ===== >> "%USERPROFILE%\qorai-price.log"
