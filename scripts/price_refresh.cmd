@echo off
rem Qor AI — nightly Amazon.com.tr price refresh (epey_amazon connector).
rem Runs on this PC (residential IP) because Epey 403-blocks datacenter IPs —
rem the Hetzner box cannot fetch epey.com. Scheduled task: QorAI-PriceRefresh.
rem Pass 1 refreshes every currently-priced product (oldest check first);
rem pass 2 expands coverage (never-checked flagships first); then one TS backfill.
rem NOT: PB bu kurulumda çoklu sort'u ("a,-b") 400'ler — her pass TEKLİ sort kullanır.
cd /d C:\Users\RN8\Desktop\Compair-master
echo ===== %date% %time% price refresh start ===== >> "%USERPROFILE%\qorai-price.log"
set NO_REINDEX=1
rem pass1 — refresh: fiyat gösteren her ürünü yenile (en eski kontrol önce)
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount>0" --sort=bestOfferCheckedAt --limit=4000 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass2 — discovery: hic taranmamislar; once Epey'de fiyati OLANLAR (Amazon olasiligi yuksek) + yuksek techScore
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt='' && price_raw!=''" --sort=-techScore --limit=2500 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass2b — discovery (kalanlar): Epey fiyatsizlar dahil genel tarama
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt=''" --sort=-techScore --limit=500 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
rem pass3 — recheck: daha once bakilmis ama fiyatsiz kalanlari arada yeniden dene
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt!=''" --sort=bestOfferCheckedAt --limit=300 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
set NO_REINDEX=
node scripts\ts_backfill_lowest_price.js --confirm >> "%USERPROFILE%\qorai-price.log" 2>&1
echo ===== %date% %time% price refresh done ===== >> "%USERPROFILE%\qorai-price.log"
