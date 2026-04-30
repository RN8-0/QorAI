@echo off
setlocal
title Qor AI Scraper Proxy

for %%I in ("%~dp0..") do set "DEFAULT_ROOT=%%~fI"
set "ROOT=%DEFAULT_ROOT%"
echo Qor AI Scraper Proxy launcher
echo.

if not exist "%ROOT%\scripts\scraper-proxy.js" (
  if exist "%USERPROFILE%\Desktop\Compair-master\scripts\scraper-proxy.js" set "ROOT=%USERPROFILE%\Desktop\Compair-master"
)

if not exist "%ROOT%\scripts\scraper-proxy.js" (
  if exist "%USERPROFILE%\Desktop\Qor AI-master\scripts\scraper-proxy.js" set "ROOT=%USERPROFILE%\Desktop\Qor AI-master"
)

if not exist "%ROOT%\scripts\scraper-proxy.js" (
  if exist "%USERPROFILE%\Desktop\Qor AI\scripts\scraper-proxy.js" set "ROOT=%USERPROFILE%\Desktop\Qor AI"
)

if not exist "%ROOT%\scripts\scraper-proxy.js" (
  echo.
  echo Default project folder was not found: "%DEFAULT_ROOT%"
  set /p ROOT=Qor AI project folder path: 
  if "%ROOT%"=="" (
    echo.
    echo ERROR: No folder path was entered.
    pause
    exit /b 1
  )
  if not exist "%ROOT%\scripts\scraper-proxy.js" (
    echo.
    echo ERROR: "%ROOT%\scripts\scraper-proxy.js" was not found.
    echo Make sure you entered the repository root folder.
    pause
    exit /b 1
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js was not found. Install Node.js and try again.
  pause
  exit /b 1
)

cd /d "%ROOT%"
echo.
echo Repository folder: %ROOT%
echo Starting proxy... Requests will use this device IP address.
echo Use "Check Proxy" in the admin panel to verify the status.
echo.
node scripts\scraper-proxy.js
pause
