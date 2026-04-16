@echo off
setlocal
title Compair Scraper Proxy

set "DEFAULT_ROOT=%USERPROFILE%\Desktop\Compair-master"
echo Compair Scraper Proxy launcher
echo.
set /p ROOT=Compair klasor yolu [%DEFAULT_ROOT%]:
if "%ROOT%"=="" set "ROOT=%DEFAULT_ROOT%"

if not exist "%ROOT%\scripts\scraper-proxy.js" (
  echo.
  echo HATA: "%ROOT%\scripts\scraper-proxy.js" bulunamadi.
  echo Repo klasorunu dogru girdiginden emin ol.
  pause
  exit /b 1
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
echo Proxy baslatiliyor... Bu cihazin IP adresi kullanilacak.
echo Admin panelde "Check Proxy" ile durumu gorebilirsin.
echo.
node scripts\scraper-proxy.js
pause
