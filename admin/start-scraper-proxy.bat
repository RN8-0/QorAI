@echo off
setlocal
title Qor AI Scraper Proxy

for %%I in ("%~dp0..") do set "DEFAULT_ROOT=%%~fI"
set "ROOT=%DEFAULT_ROOT%"
set "INSTALL_ROOT=%LOCALAPPDATA%\QorAI\Compair-master"
set "REPO_URL=https://github.com/RN8-0/QorAI.git"
set "ZIP_URL=https://github.com/RN8-0/QorAI/archive/refs/heads/master.zip"
echo Qor AI Scraper Stack launcher
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
  if exist "%INSTALL_ROOT%\scripts\scraper-proxy.js" set "ROOT=%INSTALL_ROOT%"
)

if not exist "%ROOT%\scripts\start-scraper-stack.js" (
  echo Repository files were not found or are outdated.
  echo Installing/updating Qor AI scraper stack under:
  echo   %INSTALL_ROOT%
  echo.

  if not exist "%LOCALAPPDATA%\QorAI" mkdir "%LOCALAPPDATA%\QorAI" >nul 2>nul

  where git >nul 2>nul
  if not errorlevel 1 (
    if exist "%INSTALL_ROOT%\.git" (
      echo Updating existing repository...
      git -C "%INSTALL_ROOT%" pull --ff-only
    ) else (
      if exist "%INSTALL_ROOT%" rmdir /s /q "%INSTALL_ROOT%"
      echo Cloning repository...
      git clone --depth 1 "%REPO_URL%" "%INSTALL_ROOT%"
    )
  ) else (
    echo Git was not found. Downloading repository ZIP...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$ErrorActionPreference='Stop';" ^
      "$root=$env:LOCALAPPDATA + '\QorAI';" ^
      "$install=$root + '\Compair-master';" ^
      "$zip=$env:TEMP + '\qorai-master.zip';" ^
      "$tmp=$env:TEMP + '\qorai-master-extract';" ^
      "if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force};" ^
      "if(Test-Path $install){Remove-Item $install -Recurse -Force};" ^
      "Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile $zip;" ^
      "Expand-Archive -Path $zip -DestinationPath $tmp -Force;" ^
      "$src=Get-ChildItem $tmp -Directory | Select-Object -First 1;" ^
      "Move-Item $src.FullName $install;" ^
      "Remove-Item $zip -Force;" ^
      "Remove-Item $tmp -Recurse -Force;"
  )

  set "ROOT=%INSTALL_ROOT%"
)

if not exist "%ROOT%\scripts\scraper-proxy.js" (
  echo.
  echo ERROR: "%ROOT%\scripts\scraper-proxy.js" was not found.
  echo The repository download/install did not complete.
  set /p ROOT=Enter Qor AI repository folder path manually: 
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

if not exist "%ROOT%\scripts\start-scraper-stack.js" (
  echo.
  echo ERROR: "%ROOT%\scripts\start-scraper-stack.js" was not found.
  echo Update the repository files, then run this launcher again.
  pause
  exit /b 1
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
echo Starting Qor AI scraper stack...
echo This checks dependencies, starts FlareSolverr when Docker is available,
echo starts the translate worker, then starts the scraper proxy.
echo.
node scripts\start-scraper-stack.js
pause
