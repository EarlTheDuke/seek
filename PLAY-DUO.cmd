@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - the long cheap run

REM ===========================================================================
REM  TWO MINDS, ALL DAY, FOR PENNIES.
REM
REM  One grok (the fast non-reasoning one) and one kimi on your own box.
REM  About 14p an hour. Everything else is the same as PLAY.cmd.
REM ===========================================================================

echo.
echo   HIGHLANDS - the long run
echo   ------------------------
echo.

if not exist "keys.cmd" (
  copy /y "keys.example.cmd" "keys.cmd" >nul 2>&1
  echo   No keys.cmd yet — I have made you a blank one. Right-click it, choose
  echo   Edit, and paste your XAI_API_KEY and TINYBOX_API_KEY into it.
  echo.
  pause
  exit /b 1
)
call "keys.cmd"

if not exist "node_modules" (
  echo   First run — installing. This takes a minute.
  call npm install || goto :failed
)

echo   Checking both keys and both model names...
echo.
set "MINDS_ROSTER=roster-duo.json"
call npm run keycheck
if errorlevel 1 (
  echo.
  echo   Fix the lines above first, or those players will just be scripted and
  echo   a long run will prove nothing. Then run this again.
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

REM  Hungry from the start. Nothing is at stake in a full stomach, and the whole
REM  point of this run is to see whether two minds trade.
set "HUNGER=52"

REM  A leaner valley — but the gentle setting, not the hard one. Two people in a
REM  whole glen have more than they can use at the default, and a hoarder with
REM  infinite firewood is indistinguishable from a generous one. The hard
REM  setting risks a starvation spiral ruining a run meant to go all day.
set "SCARCE=0.7,0.5"

REM  Your name in the game.
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
echo    Eachann  grok-4.20-non-reasoning   thinks every 20s   a hoarder
echo    Coinneach  kimi-k2.6 (your box)    thinks every 75s   blunt, asks
echo.
echo    ABOUT 14p AN HOUR. Kimi is free; only the grok seat costs.
echo    Hard stop at 6000 calls in roster-duo.json.
echo.
echo    WATCH FOR: the gold column moving on the board, a deed reading
echo    "I traded ...", or an offer in the chat. Six verbs shipped
echo    yesterday and none has ever been used by a real model.
echo.
echo    STOP.cmd when you are done.
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
