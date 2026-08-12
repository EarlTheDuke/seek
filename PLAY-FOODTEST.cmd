@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - the food-chain proof run

REM ===========================================================================
REM  THE FOOD-CHAIN PROOF RUN. Two Grok, two Kimi, one scripted control.
REM
REM  Four breaks in the food chain were fixed on 2026-08-11 and all four are
REM  proven BY HARNESS ONLY (npm run foodcheck, 20/20). TRAJECTORY.md gates
REM  arcs 3-6 on the difference between that and a live run. This is the run.
REM
REM  WATCH FOR, in order:
REM    1. Does a pack ever GAIN wood?  (82 of 98 gathers were refused before)
REM    2. Does the verb `eat` appear on the board? (bodies always ate by REFLEX
REM       below 45 — a mind CHOOSING to eat is the new thing)
REM    3. Does anybody survive the night unaided?
REM
REM  Double-click STOP.cmd when you are done. That is what stops the money.
REM ===========================================================================

echo.
echo   HIGHLANDS — the food-chain proof run
echo   ------------------------------------
echo.

if not exist "keys.cmd" (
  echo   No keys.cmd — every player would be SCRIPTED and this run would prove
  echo   nothing. Copy keys.example.cmd to keys.cmd and paste your keys in.
  echo.
  pause
  exit /b 1
)
call ".\keys.cmd"

REM  A SERVER LEFT OVER FROM EARLIER IS THE WORST FAILURE THERE IS, and for
REM  this run it is worse than usual: node does not hot-reload, so an old
REM  server is running PRE-FIX code and the whole point of tonight is lost.
REM  One was found holding 8080 on 2026-08-11 from a run 2.5 hours earlier.
set "BUSY="
for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do set "BUSY=%%p"
if defined BUSY (
  echo   A Highlands server is already running from earlier ^(process !BUSY!^).
  echo   It is running the code it was STARTED with, not tonight's fixes.
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

REM  HUNGER=52 is chosen, not inherited. The reflex eats a cooked meal below 45
REM  and raw below 18, so 52 starts everybody just ABOVE the reflex and lets
REM  them fall into it — which is the only staging where you can see the
REM  difference between a body eating on instinct and a MIND deciding to.
set "HUNGER=52"

REM  SCARCE is deliberately OFF. With the ten-branch fire a lean valley is
REM  genuinely hard, and tonight is a test of whether the chain works at all,
REM  not of whether it works under pressure. Turn it on for the SECOND run.

set "MYNAME=Ben"

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
echo    READ THE "MINDS" WINDOW FIRST — one line per player naming the
echo    model actually behind it. Anyone showing "(no ..._API_KEY)" is
echo    running SCRIPTED and does not count toward tonight's question.
echo.
echo    Iseabail is scripted ON PURPOSE. She is the control.
echo   ---------------------------------------------------------------
echo.
pause
exit /b 0
