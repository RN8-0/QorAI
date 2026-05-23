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

set "TRANSLATE_PY=%ROOT%\scripts\translate-venv\Scripts\python.exe"
set "TRANSLATE_WORKER=%ROOT%\scripts\argos-translate-worker.py"
if exist "%TRANSLATE_PY%" if exist "%TRANSLATE_WORKER%" (
  echo Starting Argos+CTranslate2 GPU translation worker on http://127.0.0.1:8797 ...
  start "Qor AI Local Translate" /min cmd /k "cd /d ""%ROOT%"" && ""%TRANSLATE_PY%"" ""%TRANSLATE_WORKER%"" > local-translate-worker.log 2> local-translate-worker.err"
) else (
  echo Argos worker not found at %TRANSLATE_WORKER% — falling back to NLLB Node worker.
  start "Qor AI Local Translate" /min cmd /k "cd /d ""%ROOT%"" && npm run translate:worker > local-translate-worker.log 2> local-translate-worker.err"
)

echo Starting proxy... Requests will use this device IP address.
echo Use "Check Proxy" in the admin panel to verify the status.
echo.
node scripts\scraper-proxy.js
pause
