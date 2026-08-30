@echo off
REM Kanonik spec onarimi -- kategori kategori, SIRAYLA.
REM `--all` 107k kaydi tek seferde bellege aliyor ve PB'ye 215 sayfalik tek
REM bir sagnak yolluyor; tek host zaten takas kullaniyor. Kategori bazli kosu
REM ayni isi yapar, ilerlemeyi gorunur kilar ve yarida kesilirse kalan
REM kategoriler etkilenmez.
setlocal
cd /d "%~dp0.."
for %%C in (desktops laptops headphones tvs smartphones monitors ram audio_systems chargers pc_cases mice keyboards graphics_cards smartwatches ssd powerbanks motherboards tablets microphones projectors robot_vacuums cpu_coolers printers flash_drives psu ip_cameras routers camera_lenses gamepads cpus dashcams drones media_players ups laptop_coolers case_fans webcams 3d_printers modem_routers av_receivers e_readers gimbals vr_headsets gaming_consoles hardware_wallets smart_rings) do (
  echo === %%C ===
  node scripts/repair_specs_canonical.js --apply --category=%%C --concurrency=4
  if errorlevel 1 echo [HATA] %%C basarisiz
)
echo === BITTI ===
endlocal
