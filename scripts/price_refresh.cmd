@echo off
rem Qor AI — nightly Amazon.com.tr price refresh (epey_amazon connector).
rem Runs on this PC (residential IP) because Epey 403-blocks datacenter IPs —
rem the Hetzner box cannot fetch epey.com. Scheduled task: QorAI-PriceRefresh.
rem Pass 1 refreshes every currently-priced product (oldest check first);
rem pass 2 expands coverage (never-checked flagships first); then one TS backfill.
cd /d C:\Users\RN8\Desktop\Compair-master
echo ===== %date% %time% price refresh start ===== >> "%USERPROFILE%\qorai-price.log"
set NO_REINDEX=1
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount>0" --sort=bestOfferCheckedAt --limit=4000 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
node scripts\sync_offers.js --connector=epey_amazon "--filter-extra=pricedOfferCount<1" "--sort=bestOfferCheckedAt,-techScore" --limit=700 --concurrency=2 >> "%USERPROFILE%\qorai-price.log" 2>&1
set NO_REINDEX=
node scripts\ts_backfill_lowest_price.js --confirm >> "%USERPROFILE%\qorai-price.log" 2>&1
echo ===== %date% %time% price refresh done ===== >> "%USERPROFILE%\qorai-price.log"
