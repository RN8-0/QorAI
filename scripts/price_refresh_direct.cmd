@echo off
rem Qor AI — Amazon.de / .co.uk / .com (amazon_direct) gece fiyat gorevi.
rem Scheduled task: QorAI-PriceDirect (03:12 + kacirilinca acilista).
rem
rem AYRI GOREV cunku ana zincirin (QorAI-PriceRefresh) pass5'i olarak hicbir
rem gece bitemiyordu: PC gunduz acilip ogleden sonra kapaninca 3096 urunluk
rem amazon_direct pass'ine 1 saat kaliyordu. Ayri sureste epey.com hattiyla
rem PARALEL kosar (farkli hostlar) — sinirli pencerede iki kat is.
rem
rem Hiz: amazon_page host basina ayri pace gate kullanir (5 sn + jitter) ve
rem pazarlar paralel fiyatlanir → urun basina ~25 sn yerine ~6-8 sn.
rem US: jar'siz + statik i18n-prefs=USD cookie (warmup captcha'si jar'i
rem zehirliyordu — amazon_page NO_SESSION_MARKETS default'u US).
rem Bot duvari cikarsa pazar breaker'i 45 dk sogur, sonra tek probe ile geri;
rem duvar/sanity aninda mevcut satirlar keep-alive ile korunur (silinmez).
rem
rem SIRA: kesif ONCE, refresh SONRA — PC gunduz kapatilirsa yeni kapsam
rem kazanilmis olur; mevcut fiyatlar 50 saatlik expiry + keep-alive ile ertesi
rem geceyi zaten cikarir. Kesif erken kosuyor ki ana zincirin pass2b'si
rem (generic tarama, ~4-5 saat sonra baslar) ayni taranmamis havuzun tepesini
rem bestOfferCheckedAt ile damgalamadan once amiral gemilerini biz alalim.
cd /d C:\Users\RN8\Desktop\Compair-master
echo ===== %date% %time% direct refresh start ===== >> "%USERPROFILE%\qorai-price-direct.log"
set NO_REINDEX=1
set AMAZON_DIRECT_MARKETS=DE,GB,US
rem amazon.com en siki storefront: jar'siz modda bile yuk altinda captcha
rem cekebiliyor (2026-07-04 smoke: ~40 dk sonra US breaker) — US'i yavaslat.
set AMAZON_DIRECT_GAP_MS_US=9000
rem pass1 — discovery (TR'de satilmayanlar): hic fiyati olmayan + Epey'de de
rem fiyat gorunmeyen urunler (OnePlus Pad 4 / Pixel sinifi: TR'de satilmiyor
rem ama amazon.com/.de/.co.uk'ta satista). TR ASIN'i yok → connector isim
rem aramasiyla YEREL ASIN cozer (strict token eslesme; TR hakem yoksa
rem sanity(prev) korur). Arama+dp = urun basina pahali → kucuk gunluk kota.
node scripts\sync_offers.js --connector=amazon_direct "--filter-extra=source='epey.com' && pricedOfferCount<1 && price_raw='' && bestOfferCheckedAt=''" --sort=-techScore --limit=300 --concurrency=2 >> "%USERPROFILE%\qorai-price-direct.log" 2>&1
rem pass1b — recheck: bakilmis ama hala fiyatsiz kalanlar, en eski once
rem (rollup fiyatsiz taramada da bestOfferCheckedAt damgalar → dogal rotasyon;
rem epey'in yalniz-TR baktigi Haziran damgalilari da boylece DE/GB/US sansi alir).
node scripts\sync_offers.js --connector=amazon_direct "--filter-extra=source='epey.com' && pricedOfferCount<1 && bestOfferCheckedAt!=''" --sort=bestOfferCheckedAt --limit=250 --concurrency=2 >> "%USERPROFILE%\qorai-price-direct.log" 2>&1
rem pass2 — refresh/expand: TR fiyati bilinen urunler (ASIN hazir, dp-fetch
rem ucuz). SKIP_FRESH sayesinde 2. geceden itibaren cogunlukla atlanir.
rem 2026-08-07 SIRALAMA DUZELTMESI: sort=-techScore HER GECE AYNI ilk 8000 urunu
rem getiriyordu — dusuk puanli kuyruga sira HIC gelmiyordu. bestOfferExpiresAt
rem (artan) = damgasi en once dolan once → havuz dogal olarak tur atar. Ayni
rem duzeltme epey_amazon pass1'de 2026-07-26'da yapilmisti, burada atlanmis.
node scripts\sync_offers.js --connector=amazon_direct --all-variants "--filter-extra=source='epey.com' && pricedOfferCount>0" --sort=bestOfferExpiresAt --limit=8000 --concurrency=2 >> "%USERPROFILE%\qorai-price-direct.log" 2>&1
set NO_REINDEX=
node scripts\ts_backfill_lowest_price.js --confirm >> "%USERPROFILE%\qorai-price-direct.log" 2>&1
echo ===== %date% %time% direct refresh done ===== >> "%USERPROFILE%\qorai-price-direct.log"
