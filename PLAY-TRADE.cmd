@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - the trade-pressure run

REM ===========================================================================
REM  THE TRADE-PRESSURE RUN - does the verb get reached for on its own?
REM
REM  Same two grok-4.6 seats as 2026-08-17, same colliding characters - but a
REM  hard winter, event-driven attention, pinned deals, and a prompt that
REM  teaches conversation. See roster-trade.json for what decides the
REM  experiment either way. About $1.25 an hour for the pair.
REM ===========================================================================

echo.
echo   HIGHLANDS - the trade-pressure run
echo   ----------------------------------
echo.

if not exist "keys.cmd" (
  copy /y "keys.example.cmd" "keys.cmd" >nul 2>&1
  echo   No keys.cmd yet - I have made you a blank one. Right-click it, choose
  echo   Edit, and paste your XAI_API_KEY into it.
  echo.
  pause
  exit /b 1
)
REM  `.\` on purpose - see PLAY-DUO.cmd for the NoDefaultCurrentDirectoryInExePath trap.
call ".\keys.cmd"

if not exist "node_modules" (
  echo   First run - installing. This takes a minute.
  call npm install || goto :failed
)

echo   Checking the key and both model names...
echo.
set "MINDS_ROSTER=roster-trade.json"
call npm run keycheck
if errorlevel 1 (
  echo.
  echo   Fix the lines above first, or those players will just be scripted and
  echo   the run will prove nothing. Then run this again.
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

REM ---- the world: A HARD WINTER ----------------------------------------------
REM  SCARCE=on is the point of this run. Two people in a gentle glen have more
REM  than they can use, and a hoarder with infinite firewood is
REM  indistinguishable from a generous one. Hungry start for the same reason.
set "DANGER=no-bears"
set "SOLID=on"
set "PERSONAS=on"
set "NARRATE=on"
set "BOARD=on"
set "MINDS_HUNTERS=0"
set "HUNGER=45"
set "SCARCE=on"

REM  Two hours, then the minds stop themselves. STOP.cmd still needed for the
REM  world - it keeps the port.
set "AGENT_SECONDS=7200"
set "MAX_CALLS=250"

set "MYNAME=Ben"

echo.
echo   Starting the world...
start "Highlands - SERVER  (leave me open)" cmd /k node server\server.js 8080
timeout /t 5 /nobreak >nul

echo   Waking two minds...
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
echo    Fingal   grok-4.6   thinks every 60s   hoards, prices all
echo    Ailsa    grok-4.6   thinks every 75s   blunt, asks plainly
echo.
echo    A HARD WINTER. Both hungry. The question is one thing only:
echo    does offer / give / accept get used UNPROMPTED?
echo.
echo    WATCH FOR on the board:
echo      - "On the table:" lines - a pinned deal in a brief
echo      - the gold column moving, a deed reading "I traded ..."
echo      - TALK TO THEM. Attention is event-driven now: open with a
echo        name - "Fingal, what will you take for wood?" - and the
echo        reply should come in seconds, not a cadence.
echo.
echo    STOP.cmd when you are done. That is what stops the money.
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
