@echo off
setlocal
title Qor AI Scraper Proxy

set "DEFAULT_ROOT=%USERPROFILE%\Desktop\Qor AI-master"
set "ROOT=%DEFAULT_ROOT%"
echo Qor AI Scraper Proxy launcher
echo.

if not exist "%ROOT%\scripts\scraper-proxy.js" (
  echo.
  echo Varsayilan klasor bulunamadi: "%ROOT%"
  set /p ROOT=Qor AI klasor yolu:
  if "%ROOT%"=="" (
    echo.
    echo HATA: Klasor yolu girilmedi.
    pause
    exit /b 1
  )
  if not exist "%ROOT%\scripts\scraper-proxy.js" (
    echo.
    echo HATA: "%ROOT%\scripts\scraper-proxy.js" bulunamadi.
    echo Repo klasorunu dogru girdiginden emin ol.
    pause
    exit /b 1
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo HATA: Node.js bulunamadi. Node.js kurup tekrar dene.
  pause
  exit /b 1
)

cd /d "%ROOT%"
echo.
echo Repo klasoru: %ROOT%
echo Proxy baslatiliyor... Bu cihazin IP adresi kullanilacak.
echo Admin panelde "Check Proxy" ile durumu gorebilirsin.
echo.
node scripts\scraper-proxy.js
pause
