@echo off
rem Qor AI  GECE FIYAT ZINCIRI (tek gorev, sabit sira).
rem
rem NEDEN TEK DOSYA: TR ve DIRECT zincirleri AYNI kilidi kullaniyor ve ikisi
rem ayri gorev olarak 03:10 / 03:12 kurulunca hangisinin kilidi once kaptigi
rem TETIKLENME SIRASINA kaliyordu. PC gece uyursa iki gorev de uyanista
rem "kacirilan kosu" olarak ayni anda fire ediyor ve sira garanti degil.
rem 2026-08-24 tam bu oldu: DIRECT kilidi kapti, TR 5 saat bekleyip
rem atlayacakti. Olculdu  TR kosu basina 25.258 teklif (~16 sa), DIRECT
rem ~400 teklif (~22 sa): yani 60 kat verimli olan zincir marjinal olan
rem yuzunden hic kosmayacakti.
rem
rem Cozum: tek gorev, sabit sira. Once TR (tam kota), sonra DIRECT.
rem Yaris yok, kilit cakismasi yok. Her iki .cmd kendi kilidini alip
rem birakiyor, o yuzden pes pese cagirmak guvenli.
cd /d "%~dp0.."
call "%~dp0price_refresh.cmd"
call "%~dp0price_refresh_direct.cmd"
