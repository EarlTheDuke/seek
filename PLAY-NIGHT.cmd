@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - the night run

REM ===========================================================================
REM  THE NIGHT RUN — arc 1's real bar, in a valley that is actually hard.
REM
REM  The 2026-08-11 proof run answered "can the chain complete": yes, three of
REM  four model seats. It left two things open, and this run is aimed at both:
REM
REM    1. A SEAT SURVIVING A NIGHT UNAIDED. The proof run was 17 minutes in a
REM       comfortable valley. That is not the bar TRAJECTORY.md sets.
REM    2. HAS ANY MIND EVER *CHOSEN* TO EAT? Not one has. Every meal so far was
REM       the reflex firing below hunger 45. The `eat` verb exists for eating
REM       EARLY — before a hunt, ahead of the cold — and in a valley with food
REM       lying about nobody ever needs to.
REM
REM  SCARCE=on is the change that makes (2) answerable. It is also genuinely
REM  hard now the fire costs ten branches: one scripted body in six died
REM  overnight in testing. That is the point — character and choice only show
REM  when something is at stake.
REM
REM  AND THE STOP ACTUALLY WORKS NOW. `for=` read a clock that counted ticks
REM  and ran 26%% slow, so an hour run kept spending well past the hour. Fixed
REM  2026-08-12 (fleetclock.js); this run will stop when it says it will.
REM
REM  STOP.cmd stops it early. That is what stops the money.
REM ===========================================================================

echo.
echo   HIGHLANDS — the night run
echo   -------------------------
echo.

if not exist "keys.cmd" (
  echo   No keys.cmd — every player would be SCRIPTED and this run would prove
  echo   nothing. Copy keys.example.cmd to keys.cmd and paste your keys in.
  echo.
  pause
  exit /b 1
)
call ".\keys.cmd"

set "BUSY="
for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do set "BUSY=%%p"
if defined BUSY (
  echo   A Highlands server is already running ^(process !BUSY!^). It is running
  echo   the code it was STARTED with, not today's fixes.
  echo.
  set /p "KILLIT=  Close it and start fresh? [Y/n] "
  if /i not "!KILLIT!"=="n" (
    taskkill /PID !BUSY! /F >nul 2>&1
    echo   Closed it.
    timeout /t 2 /nobreak >nul
  )
  echo.
)

REM ------------------------------------------------------- tonight's world ---
set "MINDS_ROSTER=roster-foodtest.json"
set "DANGER=no-bears"
set "SOLID=on"
set "PERSONAS=on"
set "NARRATE=on"
set "BOARD=on"
set "MINDS_HUNTERS=0"

REM  A LEAN VALLEY. The whole reason for this run.
set "SCARCE=on"

REM  Hungry from the start, and below the reflex threshold sooner. 52 starts
REM  everybody just above `eatBelow` (45); scarcity is what decides whether they
REM  ever climb back.
set "HUNGER=52"

REM  A HARD STOP, in REAL seconds, which is a sentence that was not true before
REM  today. 90 minutes: long enough for a full night to pass in-world, short
REM  enough to leave most of the 3000-call budget unspent.
set "AGENT_SECONDS=5400"

set "MYNAME=Jack"

echo   Starting the world...
start "Highlands - SERVER  (leave me open)" cmd /k node server\server.js 8080
timeout /t 5 /nobreak >nul

echo   Waking the minds...
start "Highlands - MINDS  (leave me open)" cmd /k npm run agents
timeout /t 3 /nobreak >nul

echo   Starting the web page...
start "Highlands - WEB  (leave me open)" cmd /k npx vite --port 5173 --strictPort
timeout /t 6 /nobreak >nul

echo   Opening the game and the board...
start "" "http://localhost:5173/?join=ws://127.0.0.1:8080&name=%MYNAME%&danger=no-bears&solid=on"
start "" "http://127.0.0.1:8090"

echo.
echo   ---------------------------------------------------------------
echo    WATCH FOR, in order of what would settle something:
echo      1. Does any mind CHOOSE `eat`? The board shows the verb.
echo         Every meal so far has been the reflex, not a decision.
echo      2. Does a seat get through the night unaided?
echo      3. Do two seats reach an outcome neither could alone?
echo.
echo    Stops itself after 90 real minutes. STOP.cmd ends it sooner.
echo   ---------------------------------------------------------------
echo.
pause
exit /b 0
