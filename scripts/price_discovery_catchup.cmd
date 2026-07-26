@echo off
rem Qor AI — TEK SEFERLIK yakalama koşusu (2026-07-26).
rem
rem Neden: connector eskiden yalniz Amazon.com.tr satirini yaziyordu; Epey
rem sayfasinda Amazon olmayan 31.901 urun fiyatsiz kaldi ve gecelik kesif
rem filtresi (bestOfferCheckedAt='') onlari bir daha hic taramadi. Connector
rem artik en ucuz 3 magazayi da yaziyor -> bu havuz tek taramada fiyat kazanir.
rem
rem Sira: once VITRIN kategorileri (ana sayfa/kategori sayfalarinda gorunenler),
rem sonra genel havuz. Boylece kullanici sonucu dakikalar icinde gorur.
rem Tek surec: epey.com'a istek hizi connector'un global 1.1 sn kapisiyla sabit
rem kalir (paralel surec ACMA — bot duvarina caparsin).
cd /d C:\Users\RN8\Desktop\Compair-master
set LOG=%USERPROFILE%\qorai-price-discovery.log
echo ===== %date% %time% yakalama kosusu basladi ===== >> "%LOG%"
set NO_REINDEX=1

rem --- 1) Vitrin kategorileri: her biri populerden basa (techScore desc) ---
for %%C in (smartphones tablets laptops smartwatches headphones tvs monitors gaming_consoles) do (
  echo --- kategori %%C --- >> "%LOG%"
  node scripts\sync_offers.js --connector=epey_amazon --all-variants --cat=%%C "--filter-extra=pricedOfferCount<1 && price_raw!=''" --sort=-techScore --limit=400 --concurrency=3 >> "%LOG%" 2>&1
)
rem Vitrin bitti -> hemen indeksle ki site ANINDA gostersin
set NO_REINDEX=
node scripts\ts_backfill_lowest_price.js --confirm >> "%LOG%" 2>&1
set NO_REINDEX=1

rem --- 2) Genel havuz: kalan her sey, en eski taranan once (dogal rotasyon) ---
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount<1 && price_raw!=''" --sort=bestOfferCheckedAt --limit=12000 --concurrency=3 >> "%LOG%" 2>&1

set NO_REINDEX=
node scripts\ts_backfill_lowest_price.js --confirm >> "%LOG%" 2>&1
echo ===== %date% %time% yakalama kosusu bitti ===== >> "%LOG%"
