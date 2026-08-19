@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - the grok-4.6 test

REM ===========================================================================
REM  THE GROK-4.6 TEST — four Grok, two Kimi, one scripted control, two hours.
REM
REM  grok-4.6 was probed with one real call before this file was written:
REM      grok-4.6   26.2s   completion 23   REASONING 1507
REM      grok-4.5    7.0s   completion 23   reasoning  348
REM  Every seat setting in roster-grok46.json follows from that. Read its
REM  _readme before changing a cadence or a ceiling.
REM
REM  IT IS NOT CHEAPER THAN 4.5. Same per-token price, four times the thinking,
REM  and reasoning bills as completion — so roughly twice the cost per decision.
REM
REM  WATCH FOR:
REM    1. Does grok-4.6 play BETTER, not just think longer? It gets ~1 decision
REM       per minute against Eachann's 5. Fewer, better moves is the claim.
REM    2. Does any mind CHOOSE `eat`? Still nobody, ever. Scarcity is on so
REM       there is finally a reason to eat before the reflex would.
REM    3. Does a seat survive the night unaided? Two seats reach an outcome
REM       neither could alone?
REM
REM  Stops itself after 2 REAL hours — a sentence that was only true from
REM  2026-08-12, when the fleet clock stopped counting its own ticks.
REM  STOP.cmd ends it sooner. That is what stops the money.
REM ===========================================================================

echo.
echo   HIGHLANDS — the grok-4.6 test
echo   -----------------------------
echo.

if not exist "keys.cmd" (
  echo   No keys.cmd — every player would be SCRIPTED and this would prove nothing.
  echo.
  pause
  exit /b 1
)
call ".\keys.cmd"

set "BUSY="
for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do set "BUSY=%%p"
if defined BUSY (
  echo   A Highlands server is already running ^(process !BUSY!^). It runs the code
  echo   it was STARTED with, not today's.
  echo.
  set /p "KILLIT=  Close it and start fresh? [Y/n] "
  if /i not "!KILLIT!"=="n" (
    taskkill /PID !BUSY! /F >nul 2>&1
    echo   Closed it.
    timeout /t 2 /nobreak >nul
  )
  echo.
)

set "MINDS_ROSTER=roster-grok46.json"
set "DANGER=no-bears"
set "SOLID=on"
set "PERSONAS=on"
set "NARRATE=on"
set "BOARD=on"
set "MINDS_HUNTERS=0"

REM  A lean valley. Character and CHOICE only show when something is at stake —
REM  and the `eat` verb has no reason to exist in a world with food lying about.
set "SCARCE=on"
set "HUNGER=52"

REM  Two hours, in REAL seconds.
set "AGENT_SECONDS=7200"

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
echo    READ THE "MINDS" WINDOW FIRST — one line per player naming the
echo    model actually behind it.
echo.
echo    Fingal and Ailsa are grok-4.6. They think for ~26 seconds and
echo    decide about once a minute. That is expected, not a stall.
echo   ---------------------------------------------------------------
echo.
pause
exit /b 0
