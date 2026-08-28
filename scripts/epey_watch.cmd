@echo off
rem ===================================================================
rem  Qor AI - EPEY NABZI (QorAI-EpeyWatch gorevi, 15 dk'da bir)
rem
rem  IKI ADIM (2026-08-28'de ayrildi):
rem    1) NABIZ - KILITSIZ. Epey ana sayfasindaki kategori bagimsiz "Son
rem       Eklenen Urunler" blogunu TEK istekle okur ve PB'ye tek sorgu atar
rem       (~1,5 sn). Cekilecek is varsa 10 ile cikar, yoksa 0.
rem    2) CEKME - KILITLI. Yalnizca 1. adim "is var" derse calisir:
rem       auto_discover --urls=... ile SADECE o adresler cekilir, cevrilir
rem       ve kategori yeniden puanlanir.
rem
rem  NEDEN AYRILDI: eskiden nabiz kilidi ONCE aliyordu. Gece fiyat kosusu
rem  kilidi 16 saat tuttugu icin nabiz o sure boyunca HER turda atlaniyordu
rem  (olculdu 27.08: 15:15 - 23:45 arasi 14 tur ust uste "ATLANDI"). Epey'in
rem  "Son Eklenen" blogu ~54 adreslik KAYAN bir penceredir; o 16 saatte
rem  eklenen urunler blokdan dusuyor ve bir daha hic gorunmuyordu. Artik
rem  nabiz her zaman koser ve gordugu adresleri epey_watch.js'teki bekleyen
rem  kuyruga yazar; kilit bosaldiginda kuyruk islenir.
rem
rem  Gece 23:20'deki QorAI-ProductDiscovery bunun EMNIYET AGIDIR.
rem
rem  Log dosyasi buyumesin diye 5 MB'i asinca cevrilir.
rem ===================================================================
cd /d "%~dp0.."
set LOG=%USERPROFILE%\qorai-epey-watch.log

rem Log dondurme: 5 MB ustu ise .1 olarak sakla
for %%F in ("%LOG%") do if %%~zF GTR 5242880 move /Y "%LOG%" "%LOG%.1" >nul 2>&1

rem --- 1) NABIZ (kilitsiz) --------------------------------------------
echo ===== %date% %time% epey watch nabiz ===== >> "%LOG%"
node scripts\epey_watch.js --dry-run >> "%LOG%" 2>&1
set PROBE=%ERRORLEVEL%
if not "%PROBE%"=="10" exit /b 0

rem --- 2) CEKME (ORTAK KILIT - bkz scripts\qorai_lock.cmd) -------------
rem Gercekten yeni urun var: Puppeteer ile kaziyicilari baslatacagiz. Gece
rem kesfi/fiyat kosusu devam ederken bu ust uste binerse Epey oturumu yanar.
rem Bekleme YOK (1 dk): kilit mesgulse atla - adresler kuyrukta durur ve 15 dk
rem sonra tekrar denenir, kaybolmazlar.
call "%~dp0qorai_lock.cmd" acquire epey_watch 1
set LOCKRC=%ERRORLEVEL%
if not "%LOCKRC%"=="0" echo ===== %date% %time% epey_watch cekme ERTELENDI - kilit mesgul, adresler kuyrukta ===== >> "%LOG%"
if not "%LOCKRC%"=="0" exit /b 0
echo ===== %date% %time% epey watch cekme ===== >> "%LOG%"
node scripts\epey_watch.js >> "%LOG%" 2>&1
call "%~dp0qorai_lock.cmd" release
