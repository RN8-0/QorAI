@echo off
REM Kanonik spec onarimi -- kategori kategori, SIRAYLA.
REM
REM 1) DNS YAMASI ZORUNLU. Router 53. portu engelliyor, sslip.io adresleri
REM    cozulemiyor (getaddrinfo ENOTFOUND). Yama olmadan 2026-08-30'da
REM    laptops'tan sonraki 44 kategorinin HEPSI pes pese dustu.
REM 2) HATADA DUR. Eskiden dongu hatayi yazip devam ediyordu; tek bir DNS
REM    kesintisi butun listeyi saniyeler icinde 'basarisiz' diye tuketti.
REM    Artik bir kategori iki denemede de basarisizsa dongu BITER; boylece
REM    kaldigi yer bellidir ve tekrar kosulabilir (script idempotent).
setlocal
cd /d "%~dp0.."
set CATS=desktops laptops headphones tvs smartphones monitors ram audio_systems chargers pc_cases mice keyboards graphics_cards smartwatches ssd powerbanks motherboards tablets microphones projectors robot_vacuums cpu_coolers printers flash_drives psu ip_cameras routers camera_lenses gamepads cpus dashcams drones media_players ups laptop_coolers case_fans webcams 3d_printers modem_routers av_receivers e_readers gimbals vr_headsets gaming_consoles hardware_wallets smart_rings
for %%C in (%CATS%) do (
  echo === %%C ===
  call :kos %%C
  if errorlevel 1 goto :durdu
)
echo === BITTI ===
goto :son

:kos
node --require "%~dp0dns-patch.js" scripts/repair_specs_canonical.js --apply --category=%1 --concurrency=4
if not errorlevel 1 exit /b 0
echo [uyari] %1 dustu, 30 sn sonra TEK kez daha denenecek
timeout /t 30 /nobreak >nul
node --require "%~dp0dns-patch.js" scripts/repair_specs_canonical.js --apply --category=%1 --concurrency=4
if not errorlevel 1 exit /b 0
echo [HATA] %1 iki denemede de basarisiz
exit /b 1

:durdu
echo === DURDU: yukaridaki kategoride iki deneme de basarisiz. Sorun giderilip
echo ===        script yeniden kosulabilir (idempotent).

:son
endlocal
