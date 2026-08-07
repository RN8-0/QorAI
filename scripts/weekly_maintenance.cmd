@echo off
rem ===================================================================
rem  Qor AI - HAFTALIK BAKIM (QorAI-Weekly gorevi)
rem
rem  Kullanici istegi (2026-08-07): "fiyat, yeni urun ekleme gibi otomasyon
rem  islemlerini gunluk degil HAFTALIK olarak ayarla, haftada bir bu islemler
rem  yapilacak ve admin panelden de kontrol edebilecek."
rem
rem  Onceki kurulum dort AYRI gorevdi (EpeyWatch 15 dk, ProductDiscovery 23:20,
rem  PriceRefresh 03:10, PriceDirect 03:12) ve birbirlerinin ustune biniyorlardi.
rem  Artik TEK zincir, SIRAYLA kosuyor - kilide bile gerek kalmiyor (yine de
rem  duruyor: elle baslatilan bir kosu araya girerse korur).
rem
rem  SIRA ONEMLI - once katalog buyur, sonra fiyatla:
rem    1) yeni urun kesfi (scrape + TR->EN ceviri + teknik puan)
rem    2) yeni urunlere fiyat (hic taranmamislar)
rem    3) TR fiyat tazeleme (epey_amazon: Amazon.com.tr + en ucuz 3 magaza)
rem    4) fiyati olmayanlari kesfet
rem    5) DE/GB/US (amazon_direct)
rem    6) Typesense backfill - fiyatlar site listelerine yansisin
rem
rem  KOTALAR HAFTALIK KAPSAM ICIN: fiyatli havuz ~30.000 urun ve hiz ~0,8
rem  urun/sn, yani tam tur ~10,5 saat. PC o gun bu kadar acik kalmazsa kalan
rem  urunler gelecek hafta sira alir (siralama bestOfferExpiresAt = damgasi en
rem  once dolan once, yani dogal rotasyon; hicbir urun aclik cekmez).
rem  TTL 10 gune cikarildi (haftalik + kacan bir hafta payi) - bkz
rem  scripts\connectors\epey_amazon.js.
rem ===================================================================
cd /d "%~dp0.."
set LOG=%USERPROFILE%\qorai-weekly.log

rem Log dondurme: 20 MB ustu ise .1 olarak sakla
for %%F in ("%LOG%") do if %%~zF GTR 20971520 move /Y "%LOG%" "%LOG%.1" >nul 2>&1

call "%~dp0qorai_lock.cmd" acquire weekly 300
set LOCKRC=%ERRORLEVEL%
if not "%LOCKRC%"=="0" echo ===== %date% %time% weekly ATLANDI - kilit mesgul ===== >> "%LOG%"
if not "%LOCKRC%"=="0" exit /b 0

echo ===== %date% %time% HAFTALIK BAKIM BASLADI ===== >> "%LOG%"
node scripts\job_status.js start weekly >> "%LOG%" 2>&1

rem --- 1) yeni urun kesfi: scrape + ceviri + teknik puan -----------------
echo ----- %time% adim 1/6: yeni urun kesfi ----- >> "%LOG%"
node scripts\job_status.js step weekly "yeni urun kesfi" >> "%LOG%" 2>&1
node scripts\auto_discover.js --max-hours=3 >> "%LOG%" 2>&1
echo ----- adim 1 bitti (exit=%ERRORLEVEL%) ----- >> "%LOG%"

set NO_REINDEX=1

rem --- 2) yeni urunlere fiyat (hic taranmamislar, en yeni once) ----------
echo ----- %time% adim 2/6: yeni urunlere fiyat ----- >> "%LOG%"
node scripts\job_status.js step weekly "yeni urunlere fiyat" >> "%LOG%" 2>&1
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt=''" --sort=-scrapedAt --limit=3000 --concurrency=2 >> "%LOG%" 2>&1

rem --- 3) TR fiyat tazeleme: ASIL IS ------------------------------------
echo ----- %time% adim 3/6: TR fiyat tazeleme ----- >> "%LOG%"
node scripts\job_status.js step weekly "TR fiyat tazeleme" >> "%LOG%" 2>&1
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount>0" --sort=bestOfferExpiresAt --limit=32000 --concurrency=2 >> "%LOG%" 2>&1

rem --- 4) Epey'de fiyati olan ama sitede olmayanlar ----------------------
echo ----- %time% adim 4/6: fiyat kesfi ----- >> "%LOG%"
node scripts\job_status.js step weekly "fiyat kesfi" >> "%LOG%" 2>&1
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount<1 && price_raw!=''" --sort=bestOfferCheckedAt --limit=12000 --concurrency=2 >> "%LOG%" 2>&1

rem --- 5) DE / GB / US -------------------------------------------------
echo ----- %time% adim 5/6: DE/GB/US fiyatlari ----- >> "%LOG%"
node scripts\job_status.js step weekly "DE/GB/US fiyatlari" >> "%LOG%" 2>&1
set AMAZON_DIRECT_MARKETS=DE,GB,US
set AMAZON_DIRECT_GAP_MS_US=9000
node scripts\sync_offers.js --connector=amazon_direct --all-variants "--filter-extra=source='epey.com' && pricedOfferCount>0" --sort=bestOfferExpiresAt --limit=12000 --concurrency=2 >> "%LOG%" 2>&1
node scripts\sync_offers.js --connector=amazon_direct "--filter-extra=source='epey.com' && pricedOfferCount<1 && bestOfferCheckedAt!=''" --sort=bestOfferCheckedAt --limit=1000 --concurrency=2 >> "%LOG%" 2>&1

set NO_REINDEX=

rem --- 6) Typesense backfill -------------------------------------------
echo ----- %time% adim 6/6: Typesense backfill ----- >> "%LOG%"
node scripts\job_status.js step weekly "Typesense backfill" >> "%LOG%" 2>&1
node scripts\ts_backfill_lowest_price.js --confirm >> "%LOG%" 2>&1

node scripts\job_status.js finish weekly >> "%LOG%" 2>&1
echo ===== %date% %time% HAFTALIK BAKIM BITTI ===== >> "%LOG%"
call "%~dp0qorai_lock.cmd" release
