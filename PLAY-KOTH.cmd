@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - KING OF THE HILL

REM ===========================================================================
REM  KING OF THE HILL - the first match mode. See PLAN-KOTH.md.
REM
REM  Two teams of three: two grok minds and Jack on blue, two grok minds and
REM  the scripted control on red. First side to 120 seconds of holding the
REM  ring ALONE wins - contested scores for nobody. Death drops your pack
REM  where you fell and sends you back to your team muster 25 seconds later.
REM
REM  The ordinary game is untouched: every other PLAY-*.cmd starts the world
REM  exactly as it always was. MODE=koth below is the entire difference.
REM ===========================================================================

echo.
echo   HIGHLANDS - KING OF THE HILL
echo   ----------------------------
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

echo   Checking the key and the model names...
echo.
set "MINDS_ROSTER=roster-koth.json"
call npm run keycheck
if errorlevel 1 (
  echo.
  echo   Fix the lines above first, or those players will just be scripted and
  echo   the match will prove nothing. Then run this again.
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

REM ---- THE MATCH -------------------------------------------------------------
REM  Survival stays ON and gentle - cold and hunger during a match are the
REM  interesting decisions. No hard winter here; the fight is the pressure.
set "MODE=koth"
set "MATCH_MINUTES=30"
set "POINTS_TO_WIN=120"
set "HILL_RADIUS=28"
set "RESPAWN_SECONDS=25"

REM  A match starts FED - survival stays on but must not drown the game. The
REM  first live match was forty minutes of deer hunting because every belly
REM  was empty from the whistle.
set "STOCK=venison_cooked:2,wood:8"
set "HUNGER=85"

set "DANGER=no-bears"
set "SOLID=on"
set "PERSONAS=on"
set "NARRATE=on"
set "BOARD=on"
set "MINDS_HUNTERS=0"

set "AGENT_SECONDS=2400"
set "MAX_CALLS=200"

set "MYNAME=Jack"

echo.
echo   Starting the world...
start "Highlands - SERVER  (leave me open)" cmd /k node server\server.js 8080
timeout /t 5 /nobreak >nul

echo   Waking five minds...
start "Highlands - MINDS  (leave me open)" cmd /k npm run agents
timeout /t 3 /nobreak >nul

echo   Starting the web page...
start "Highlands - WEB  (leave me open)" cmd /k npx vite --port 5173 --strictPort
timeout /t 6 /nobreak >nul

echo   Opening the game and the board...
start "" "http://localhost:5173/?join=ws://127.0.0.1:8080&name=%MYNAME%&team=blue&danger=no-bears&solid=on"
start "" "http://127.0.0.1:8090"

echo.
echo   ---------------------------------------------------------------
echo    RED    Eachann (grok-4.20, 15s) - Tormod (grok-4.5, 30s)
echo           - Iseabail (scripted control)
echo    BLUE   Fingal (grok-4.20, 15s) - Ailsa (grok-4.5, 30s) - YOU
echo.
echo    FIRST TO 120 seconds of holding the ring ALONE, or best in
echo    30 minutes. Contested = nobody scores. The chat column calls
echo    the hill, the score and every respawn.
echo.
echo    The server window names the hill the moment it starts. Fights
echo    are legal out there - the settled lowland is still a refuge.
echo    Die and you are back at your muster in 25s; your pack stays
echo    where you fell.
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
