@echo off
rem ═══════════════════════════════════════════════════════════════════
rem  Qor AI — EPEY NABZI (QorAI-EpeyWatch gorevi, 15 dk'da bir)
rem
rem  TARAMA YAPMAZ. Epey ana sayfasindaki kategori bagimsiz "Son Eklenen
rem  Urunler" blogunu TEK istekle okur; katalogda olmayan urun yoksa
rem  ~1 saniyede cikar ve hicbir sey baslatmaz. Yeni urun varsa YALNIZ o
rem  adresleri ceker (auto_discover --urls=...), kategoriyi URL yolundan
rem  cozer, cevirir ve puanlar.
rem
rem  Gece 23:20'deki QorAI-ProductDiscovery bunun EMNIYET AGIDIR: iki nabiz
rem  arasinda kayan pencereden dusen urunleri kategori bazli en-yeni
rem  listesinden toplar.
rem
rem  Log dosyasi buyumesin diye 5 MB'i asinca cevrilir.
rem ═══════════════════════════════════════════════════════════════════
cd /d "%~dp0.."
set LOG=%USERPROFILE%\qorai-epey-watch.log

rem Log dondurme: 5 MB ustu ise .1 olarak sakla
for %%F in ("%LOG%") do if %%~zF GTR 5242880 move /Y "%LOG%" "%LOG%.1" >nul 2>&1

rem ORTAK KILIT - bkz scripts\qorai_lock.cmd. Nabiz genelde 1,4 sn surer ama
rem GERCEKTEN yeni urun bulursa Puppeteer'la kaziyicilari baslatir; gece
rem kesfi/fiyat kosusu devam ederken bu ust uste binerse Epey oturumu yanar.
rem Bekleme YOK (1 deneme): kilit mesgulse atla, 15 dk sonra zaten tekrar gelir.
call "%~dp0qorai_lock.cmd" acquire epey_watch 1
set LOCKRC=%ERRORLEVEL%
if not "%LOCKRC%"=="0" echo ===== %date% %time% epey_watch ATLANDI - kilit mesgul ===== >> "%LOG%"
if not "%LOCKRC%"=="0" exit /b 0
echo ===== %date% %time% epey watch ===== >> "%LOG%"
node scripts\epey_watch.js >> "%LOG%" 2>&1
call "%~dp0qorai_lock.cmd" release
