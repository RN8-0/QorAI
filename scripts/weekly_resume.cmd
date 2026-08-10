@echo off
rem ===================================================================
rem  Qor AI - HAFTALIK TOPARLAMA (elle calistirilir)
rem
rem  NEDEN: 09.08.2026 haftalik kosusu adim 1de takildi (tarayici 8 sa 22 dk
rem  yanit vermedi), gunu yedi ve zincir adim 3un ortasinda (14199/32000) PC
rem  kapaninca kesildi. Adim 4-5-6 HIC kosmadi. Bu betik o kalani kapatir.
rem
rem  SIRA DEGISTI - ONCE ACIK KAPATILIR:
rem    1) fiyat kesfi: Epeyde fiyati olan ama bizde OLMAYAN urunler (~6.800)
rem    2) TR fiyat tazeleme: damgasi en once dolan once (dogal rotasyon)
rem    3) DE/GB/US
rem    4) Typesense backfill - fiyatlar site ve uygulamaya yansisin
rem
rem  Adim 2 (TR tazeleme) once degil, cunku Hetzner gece kosusu fiyatlarin
rem  buyuk kismini zaten taze tutuyor (olculdu: 33.526/33.647 son 7 gun icinde);
rem  asil acik fiyati HIC olmayan urunlerde.
rem
rem  BU DOSYA SAF ASCII + CRLF OLMALI - bkz qorai_lock.cmd
rem ===================================================================
cd /d "%~dp0.."
set LOG=%USERPROFILE%\qorai-weekly.log

call "%~dp0qorai_lock.cmd" acquire resume 60
set LOCKRC=%ERRORLEVEL%
if not "%LOCKRC%"=="0" echo ===== %date% %time% toparlama ATLANDI - kilit mesgul ===== >> "%LOG%"
if not "%LOCKRC%"=="0" exit /b 0

echo ===== %date% %time% TOPARLAMA BASLADI ===== >> "%LOG%"
node scripts\job_status.js start resume >> "%LOG%" 2>&1

set NO_REINDEX=1

echo ----- %time% adim 1/4: fiyat kesfi (Epeyde var bizde yok) ----- >> "%LOG%"
node scripts\job_status.js step resume "fiyat kesfi" >> "%LOG%" 2>&1
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount<1 && price_raw!=''" --sort=bestOfferCheckedAt --limit=12000 --concurrency=2 >> "%LOG%" 2>&1

echo ----- %time% adim 2/4: TR fiyat tazeleme ----- >> "%LOG%"
node scripts\job_status.js step resume "TR fiyat tazeleme" >> "%LOG%" 2>&1
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount>0" --sort=bestOfferExpiresAt --limit=32000 --concurrency=2 >> "%LOG%" 2>&1

echo ----- %time% adim 3/4: DE/GB/US fiyatlari ----- >> "%LOG%"
node scripts\job_status.js step resume "DE/GB/US fiyatlari" >> "%LOG%" 2>&1
set AMAZON_DIRECT_MARKETS=DE,GB,US
set AMAZON_DIRECT_GAP_MS_US=9000
node scripts\sync_offers.js --connector=amazon_direct --all-variants "--filter-extra=source='epey.com' && pricedOfferCount>0" --sort=bestOfferExpiresAt --limit=12000 --concurrency=2 >> "%LOG%" 2>&1

set NO_REINDEX=

echo ----- %time% adim 4/4: Typesense backfill ----- >> "%LOG%"
node scripts\job_status.js step resume "Typesense backfill" >> "%LOG%" 2>&1
node scripts\ts_backfill_lowest_price.js --confirm >> "%LOG%" 2>&1

node scripts\job_status.js finish resume >> "%LOG%" 2>&1
echo ===== %date% %time% TOPARLAMA BITTI ===== >> "%LOG%"
call "%~dp0qorai_lock.cmd" release
