@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - launcher

REM ===========================================================================
REM  DOUBLE-CLICK THIS FILE TO PLAY.
REM
REM  It starts three things in three windows (server, minds, web page), then
REM  opens the game and the mind-board in your browser. Close all three windows
REM  when you are done.
REM
REM  The only file you should ever need to edit is keys.cmd.
REM ===========================================================================

echo.
echo   HIGHLANDS
echo   ---------
echo.

REM ---------------------------------------------------------------- keys ----
if not exist "keys.cmd" (
  echo   You have no keys.cmd yet, so every player will be SCRIPTED
  echo   ^(they still play — they just have no model behind them^).
  echo.
  echo   To put real minds in: copy keys.example.cmd, rename the copy to
  echo   keys.cmd, and paste your keys into it. Then run this again.
  echo.
  copy /y "keys.example.cmd" "keys.cmd" >nul 2>&1 && echo   ^(I have just made you a blank keys.cmd to fill in.^)
  echo.
) else (
  call "keys.cmd"
)

REM -------------------------------------------------------------- checks ----
if not exist "node_modules" (
  echo   First run — installing. This takes a minute.
  call npm install || goto :failed
  echo.
)

REM Something already listening on 8080 is the single most confusing failure
REM there is: the new server dies silently and everything connects to the OLD
REM one, which has none of tonight's settings and none of the minds.
set "BUSY="
for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do set "BUSY=%%p"
if defined BUSY (
  echo   There is already a Highlands server running from earlier ^(process !BUSY!^).
  echo   If you leave it, tonight's settings and tonight's minds will NOT be used.
  echo.
  set /p "KILLIT=  Close the old one and start fresh? [Y/n] "
  if /i not "!KILLIT!"=="n" (
    taskkill /PID !BUSY! /F >nul 2>&1
    echo   Closed it.
    timeout /t 2 /nobreak >nul
  )
  echo.
)

REM ------------------------------------------------------- tonight's world ---
REM  Change any of these and re-run. Each one is safe to remove.
set "DANGER=no-bears"
set "SOLID=on"
set "MINDS_ROSTER=roster.json"
set "PERSONAS=on"
set "NARRATE=on"
set "BOARD=on"
set "MINDS_HUNTERS=0"

REM  EVERYBODY ARRIVES HUNGRY. Not a flourish — run one ended with every player
REM  at food 79 against an eat threshold of 45, so the whole hunting economy was
REM  decorative and nothing was ever at stake. Character only shows under
REM  pressure. Delete this line for a gentler world.
set "HUNGER=52"

REM  ── PvP ──
REM  Already on, and it is NOT a toggle: party members never hurt each other,
REM  and between strangers it depends on WHERE YOU ARE STANDING. Off in the
REM  settled country round the lake, on out in the strange country. Danger from
REM  people rises with the same gradient as danger from things.
REM
REM  Uncomment for a straight brawl anywhere, including at the spawn:
REM  set "PVP_EVERYWHERE=on"

REM  Your name in the game. Change it if you like.
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
echo    READ THE "MINDS" WINDOW FIRST. It prints one line per player
echo    saying which model is actually behind them. Anyone showing
echo    "(no ..._API_KEY)" is running SCRIPTED, not on a model.
echo.
echo    The GAME is the first browser tab. The BOARD ^(second tab, or
echo    http://127.0.0.1:8090^) shows what each mind is doing and WHY —
echo    put it on your second monitor.
echo.
echo    When you are finished, close all three black windows.
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
