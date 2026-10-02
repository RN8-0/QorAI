@echo off
rem ===================================================================
rem  Qor AI - ortak kilit (agir islerin ayni anda kosmasini engeller)
rem
rem  NEDEN: 2026-08-07 olcumu. QorAI-ProductDiscovery 23:20'de basladi ve
rem  10:11'e kadar (10 saat 51 dk) kostu; QorAI-PriceRefresh ile
rem  QorAI-PriceDirect ise ikisi birden 10:17:32'de basladi. Uc is ayni
rem  anda hem epey.com'a hem PocketBase'e yuklendi. PB'nin agir sayim
rem  sorgulari zaman asimina dusup jenerik 400 dondu ve dort sync_offers
rem  pass'i de ilk sayfada oldu; o gece hic fiyat cekilemedi.
rem
rem  NASIL: mkdir Windows'ta ATOMIK. Ayni anda iki surec denerse yalnizca
rem  biri basarili olur. Kilidi alamayan is sahibinin bitmesini bekler ve
rem  sure dolarsa ATLAR (ertesi gun tekrar dener).
rem  BAYAT KILIT: 1 gunden eski kilit dizini cokmus bir kosudan kalmistir,
rem  temizlenir. Yoksa tek cokme tum zinciri kalici olarak durdurur.
rem
rem  DIKKAT - BU DOSYA SAF ASCII OLMALI. cmd.exe goto/label icin dosyada
rem  BYTE OFSETIYLE geri arar; UTF-8 cok baytli karakter (kutu cizgisi,
rem  Turkce harf) ayristiriciyi kaydirir ve yorum satirlari komut olarak
rem  calistirilmaya baslar (olculdu: "LOCKDIR" -> "CKDIR").
rem
rem  KULLANIM:
rem    call "%~dp0qorai_lock.cmd" acquire <isim> [bekleme_dk]
rem       ERRORLEVEL 0 = kilit alindi, 1 = mesgul (isi atla)
rem    call "%~dp0qorai_lock.cmd" release
rem ===================================================================
setlocal
set LOCKDIR=%USERPROFILE%\.qorai-job.lock
set OWNERFILE=%LOCKDIR%\owner.txt
set LOGF=%USERPROFILE%\qorai-lock.log

if /I "%~1"=="release" goto do_release
if /I "%~1"=="acquire" goto do_acquire
echo qorai_lock: bilinmeyen komut "%~1"
endlocal & exit /b 2

:do_acquire
set JOBNAME=%~2
if "%JOBNAME%"=="" set JOBNAME=bilinmeyen
set WAITMIN=%~3
if "%WAITMIN%"=="" set WAITMIN=240
set /a N=0

:acquire_loop
if exist "%OWNERFILE%" call :drop_stale
mkdir "%LOCKDIR%" 2>nul
if not errorlevel 1 (
  echo %JOBNAME% baslangic=%date% %time%> "%OWNERFILE%"
  echo %date% %time% ALINDI %JOBNAME% >> "%LOGF%"
  endlocal & exit /b 0
)
set /a N+=1
if %N% GEQ %WAITMIN% (
  echo %date% %time% ATLANDI %JOBNAME% - kilit %WAITMIN% dk bosalmadi >> "%LOGF%"
  endlocal & exit /b 1
)
rem 60 sn bekle. timeout.exe zamanlanmis gorevde stdin olmadigi icin hata
rem verir, bu yuzden ping ile bekliyoruz.
ping -n 61 127.0.0.1 >nul
goto acquire_loop

:drop_stale
rem YAS SAAT ILE OLCULUR, TAKVIM GUNU ILE DEGIL (2026-10-02).
rem Eskiden "forfiles /D -1" vardi: o, dosyanin TARIHINE bakar. Dun
rem 17:04te alinan kilit bu sabah 09:00da "1 gunden eski" sayildi ve
rem 16 saattir kosan price_refresh in kilidi silindi. product_discovery
rem (24 paralel isci) ayni anda basladi, PB 3 GB a sisti, cekirdek onu
rem OOM ile oldurdu ve site 522 verdi. Gece yarisini asan HER is
rem kilidini ertesi sabahki ilk ise kaptiriyordu.
rem 30 saat: en uzun mesru kosu (9000 urunluk fiyat telafisi) ~19 saat.
powershell -NoProfile -NonInteractive -Command "if (((Get-Date) - (Get-Item -LiteralPath $env:OWNERFILE).LastWriteTime).TotalHours -ge 30) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 goto :eof
echo %date% %time% BAYAT kilit silindi >> "%LOGF%"
type "%OWNERFILE%" >> "%LOGF%" 2>nul
rmdir /S /Q "%LOCKDIR%" 2>nul
goto :eof

:do_release
if exist "%LOCKDIR%" (
  echo %date% %time% BIRAKILDI >> "%LOGF%"
  rmdir /S /Q "%LOCKDIR%" 2>nul
)
endlocal & exit /b 0
