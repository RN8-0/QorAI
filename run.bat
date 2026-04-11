@echo off
title Flutter-Compair
if "%MINIMIZED%"=="" (
  set MINIMIZED=1
  start "Flutter-Compair" /min cmd /k "cd /d C:\Users\RN8\Desktop\Compair-master && set MINIMIZED=1 && title Flutter-Compair && flutter run --dart-define-from-file=.env"
  exit
)
