@echo off
REM Bozuk spec DEGERLERI -- kategori kategori, SIRAYLA.
REM Ayni emniyet kurallari: DNS yamasi ZORUNLU, hatada DUR.
setlocal
cd /d "%~dp0.."
set CATS=smartphones laptops tvs monitors tablets smartwatches headphones desktops ram graphics_cards ssd powerbanks motherboards cpus audio_systems chargers pc_cases mice keyboards microphones projectors robot_vacuums cpu_coolers printers flash_drives psu ip_cameras routers camera_lenses gamepads dashcams drones media_players ups laptop_coolers case_fans webcams 3d_printers modem_routers av_receivers e_readers gimbals vr_headsets gaming_consoles hardware_wallets smart_rings
for %%C in (%CATS%) do (
  echo === %%C ===
  call :kos %%C
  if errorlevel 1 goto :durdu
)
echo === BITTI ===
goto :son

:kos
node --require "%~dp0dns-patch.js" scripts/repair_spec_values.js --apply --category=%1 --concurrency=4
if not errorlevel 1 exit /b 0
echo [uyari] %1 dustu, 30 sn sonra TEK kez daha denenecek
timeout /t 30 /nobreak >nul
node --require "%~dp0dns-patch.js" scripts/repair_spec_values.js --apply --category=%1 --concurrency=4
if not errorlevel 1 exit /b 0
echo [HATA] %1 iki denemede de basarisiz
exit /b 1

:durdu
echo === DURDU: yukaridaki kategoride iki deneme de basarisiz.

:son
endlocal
