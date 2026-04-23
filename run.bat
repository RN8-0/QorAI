@echo off
title Flutter-QorAI
if "%MINIMIZED%"=="" (
  set MINIMIZED=1
  start "Flutter-QorAI" /min cmd /k "cd /d %~dp0 && set MINIMIZED=1 && title Flutter-QorAI && flutter run --dart-define-from-file=.env"
  exit
)
