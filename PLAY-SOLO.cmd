@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - solo

REM ===========================================================================
REM  THE WORLD, ALONE. No API keys, no server, no cost - the original game:
REM  walk, hunt, build a camp, survive the night. Everything is generated in
REM  code; the page IS the whole game in this mode.
REM
REM  Close the black window (or run STOP.cmd) when you are done. Nothing here
REM  ever calls a paid API.
REM ===========================================================================

echo.
echo   HIGHLANDS - solo
echo   ----------------
echo.

if not exist "node_modules" (
  echo   First run - installing. This takes a minute.
  call npm install || goto :failed
)

REM ---- clear a stale web server, so the port is ours --------------------------
set "BUSY="
for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do set "BUSY=%%p"
if defined BUSY (
  echo   Closing an older Highlands page that was still running...
  taskkill /PID !BUSY! /F >nul 2>&1
  timeout /t 2 /nobreak >nul
)

echo   Starting the world...
start "Highlands - WEB  (leave me open)" cmd /k npx vite --port 5173 --strictPort
timeout /t 6 /nobreak >nul

echo   Opening the game...
start "" "http://localhost:5173/"

echo.
echo   ---------------------------------------------------------------
echo    WASD to walk, Shift to sprint, C to crouch. Mouse 1 draws the
echo    bow. E uses what is in front of you, G lights a fire, B builds,
echo    R eats, Q drops. Press ? in the game for the full list.
echo.
echo    Check the wind before you stalk a deer, and do not run from
echo    the first rush of a bear.
echo.
echo    This mode is FREE - no API keys, nothing is spending.
echo    Close the black window when you are done.
echo   ---------------------------------------------------------------
echo.
pause
exit /b 0

:failed
echo.
echo   Something went wrong during install. Send the text above to Claude.
echo.
pause
exit /b 1
