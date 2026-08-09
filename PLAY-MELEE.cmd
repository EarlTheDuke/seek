@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - the one-hour melee

REM ===========================================================================
REM  SEVEN MINDS AND A CONTROL, FOR ONE HOUR.
REM
REM  One Opus 5, one Sonnet 5, one Haiku 4.5, two Groks, two Kimis, and
REM  Iseabail running on a hundred lines of if-statements as the control.
REM
REM  About two to three pounds for the hour. Both Kimi seats are free (your own
REM  tinybox); the cadences are set by PRICE, so the dear models think slowly.
REM ===========================================================================

echo.
echo   HIGHLANDS - the one-hour melee
echo   ------------------------------
echo.

if not exist "keys.cmd" (
  copy /y "keys.example.cmd" "keys.cmd" >nul 2>&1
  echo   No keys.cmd yet - I have made you a blank one. Right-click it, choose
  echo   Edit, and paste your keys into it.
  echo.
  pause
  exit /b 1
)
REM  `.\` on purpose. Some shells run with NoDefaultCurrentDirectoryInExePath
REM  set, and then `call keys.cmd` fails with "not recognized" even though the
REM  file is right there - which reads as "your keys are empty" and is not.
call ".\keys.cmd"

if not exist "node_modules" (
  echo   First run - installing. This takes a minute.
  call npm install || goto :failed
)

echo   Checking every key and every model name...
echo.
set "MINDS_ROSTER=roster-melee.json"
call npm run keycheck
if errorlevel 1 (
  echo.
  echo   Fix the lines above first, or those seats will just be scripted and an
  echo   hour of watching will prove nothing about those models. Then run again.
  echo.
  pause
  exit /b 1
)

REM ---- clear a stale server, the one genuinely confusing failure -------------
set "BUSY="
for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do set "BUSY=%%p"
if defined BUSY (
  echo   Closing an older Highlands server that was still running...
  taskkill /PID !BUSY! /F >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM ---- the world --------------------------------------------------------------
set "DANGER=no-bears"
set "SOLID=on"
set "PERSONAS=on"
set "NARRATE=on"
set "BOARD=on"
set "MINDS_HUNTERS=0"

REM  Hungry from the start. Nothing is at stake in a full stomach.
set "HUNGER=52"

REM  A leaner valley, the gentle setting. Character only shows when something is
REM  scarce - a hoarder with infinite firewood is indistinguishable from a
REM  generous one. The hard setting risks a starvation spiral in an hour.
set "SCARCE=0.7,0.5"

REM  One hour. At the fastest cadence on the roster (20 s) that is 180 calls, so
REM  250 is a ceiling nothing should reach - it is there to stop a runaway, not
REM  to shape the run. The board shows a red SPENT tag if a seat hits it.
set "MAX_CALLS=250"

set "MYNAME=Ben"

echo.
echo   Starting the world...
start "Highlands - SERVER  (leave me open)" cmd /k node server\server.js 8080
timeout /t 5 /nobreak >nul

echo   Waking seven minds...
start "Highlands - MINDS  (leave me open)" cmd /k npm run agents
timeout /t 4 /nobreak >nul

echo   Starting the web page...
start "Highlands - WEB  (leave me open)" cmd /k npx vite --port 5173 --strictPort
timeout /t 6 /nobreak >nul

echo   Opening the game and the board...
start "" "http://localhost:5173/?join=ws://127.0.0.1:8080&name=%MYNAME%&danger=no-bears&solid=on"
start "" "http://127.0.0.1:8090"

echo.
echo   ---------------------------------------------------------------
echo    Morag      claude-opus-5        35s   thinks ahead
echo    Ailsa      claude-sonnet-5      30s   timid, keeps close
echo    Fingal     claude-haiku-4.5     25s   acts first
echo    Eachann    grok-4.20-fast       20s   hoards, names a price
echo    Tormod     grok-4.5             30s   promises easily
echo    Coinneach  kimi-k2.6 (yours)    75s   blunt, asks
echo    Seonaid    kimi-k2.6 (yours)    75s   keeps the peace
echo    Iseabail   SCRIPTED             20s   the control - leave her alone
echo.
echo    WATCH FOR: things changing hands, the "verbs refused" column,
echo    "its plan" and "its notes", and a red SPENT tag.
echo.
echo    STOP.cmd after an hour.
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
