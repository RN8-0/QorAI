@echo off
rem ═══════════════════════════════════════════════════════════════════
rem  Qor AI — GECELIK YENI URUN KESFI (QorAI-ProductDiscovery gorevi)
rem
rem  Epey'e yeni urun eklendiginde katalogda da ciksin diye her gece
rem  kosar. Fiyat sistemiyle AYNI mantik: PC acikken kendiliginden
rem  calisir, elle mudahale yok.
rem
rem  Zincir:
rem    1) auto_discover.js  — admin panelini BASSIZ acar ve
rem       scrape → ceviri (TR→EN/DE) → teknik puan adimlarini kosturur.
rem       Zaten katalogda olan urunler PB'den okunup ATLANIR, yani her
rem       gece yalnizca GERCEKTEN YENI olanlar cekilir.
rem    2) Yeni urunlere fiyat: hic taranmamis (bestOfferCheckedAt='')
rem       urunler icin Epey→Amazon.com.tr + TR magaza pass'i. Boylece
rem       urun ertesi sabah fiyatiyla birlikte yayinda olur.
rem    3) Typesense backfill — fiyatlar site listelerine yansisin.
rem
rem  ZAMANLAMA NOTU: bu gorev 23:20'de baslar ve --max-hours=3 ile
rem  sinirlidir. 03:10'daki QorAI-PriceRefresh ile ayni anda epey.com'a
rem  yuklenmemek icin boyle: iki kosu cakisirsa Epey oturumu yanar.
rem ═══════════════════════════════════════════════════════════════════
cd /d "%~dp0.."
set LOG=%USERPROFILE%\qorai-discovery.log
echo ===== %date% %time% product discovery start ===== >> "%LOG%"

rem 1) Kesif + ceviri + puan (bassiz admin paneli)
node scripts\auto_discover.js --max-hours=3 >> "%LOG%" 2>&1
set DISCOVERY_EXIT=%ERRORLEVEL%
echo ----- discovery exit=%DISCOVERY_EXIT% ----- >> "%LOG%"

rem 2) Yeni urunlere fiyat. price_refresh.cmd'nin pass2b'si ile ayni filtre
rem    ama daha buyuk kota: kesif gecesi yuzlerce urun gelebiliyor ve 800'luk
rem    gece kotasi hepsini almiyordu. En yeni kayit once.
set NO_REINDEX=1
node scripts\sync_offers.js --connector=epey_amazon --all-variants "--filter-extra=pricedOfferCount<1 && bestOfferCheckedAt=''" --sort=-created --limit=2000 --concurrency=2 >> "%LOG%" 2>&1
set NO_REINDEX=

rem 3) Fiyatlar PB'de birikip siteye yansimadan kalmasin
node scripts\ts_backfill_lowest_price.js --confirm >> "%LOG%" 2>&1

echo ===== %date% %time% product discovery done ===== >> "%LOG%"
