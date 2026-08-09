@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - Kimi night

REM ===========================================================================
REM  THE KIMI GAME. Four minds on your own tinybox, one scripted control.
REM  The ONLY key this needs is TINYBOX_API_KEY.
REM
REM  Same launcher as PLAY.cmd, pointed at roster-kimi.json instead.
REM ===========================================================================

echo.
echo   HIGHLANDS - Kimi night
echo   ---------------------
echo.

if not exist "keys.cmd" (
  copy /y "keys.example.cmd" "keys.cmd" >nul 2>&1
  echo   I have made you a blank keys.cmd. Right-click it, choose Edit, and put
  echo   your tinybox key after TINYBOX_API_KEY= . Then run this again.
  echo.
  pause
  exit /b 1
)
REM  `.\` on purpose. Some shells run with NoDefaultCurrentDirectoryInExePath
REM  set, and then `call keys.cmd` fails with "not recognized" even though the
REM  file is right there — which reads as "your keys are empty" and is not.
call ".\keys.cmd"

if not defined TINYBOX_API_KEY (
  echo   TINYBOX_API_KEY is still empty in keys.cmd.
  echo.
  echo   Right-click keys.cmd, choose Edit, and paste your tinybox key between
  echo   the quotes on this line:      set "TINYBOX_API_KEY="
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   First run — installing. This takes a minute.
  call npm install || goto :failed
)

REM ---- prove the key and the model name BEFORE starting anything ------------
echo   Checking your tinybox key and model name...
echo.
set "MINDS_ROSTER=roster-kimi.json"
call npm run keycheck
if errorlevel 1 (
  echo.
  echo   Fix the lines above first — otherwise those players will just be
  echo   scripted and the evening proves nothing. Then run this again.
  echo.
  pause
  exit /b 1
)

REM ---- clear a stale server, which is the one confusing failure -------------
set "BUSY="
for /f %%p in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do set "BUSY=%%p"
if defined BUSY (
  echo   Closing an older Highlands server that was still running...
  taskkill /PID !BUSY! /F >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM ---- tonight's world -----------------------------------------------------
set "DANGER=no-bears"
set "SOLID=on"
set "PERSONAS=on"
set "NARRATE=on"
set "BOARD=on"
set "MINDS_HUNTERS=0"
set "MYNAME=Jack"

echo.
echo   Starting the world...
start "Highlands - SERVER  (leave me open)" cmd /k node server\server.js 8080
timeout /t 5 /nobreak >nul

echo   Waking four Kimi minds...
start "Highlands - KIMI MINDS  (leave me open)" cmd /k npm run agents
timeout /t 3 /nobreak >nul

echo   Starting the web page...
start "Highlands - WEB  (leave me open)" cmd /k npx vite --port 5173 --strictPort
timeout /t 6 /nobreak >nul

echo   Opening the game and the board...
start "" "http://localhost:5173/?join=ws://127.0.0.1:8080&name=%MYNAME%&danger=no-bears&solid=on"
start "" "http://127.0.0.1:8090"

echo.
echo   ---------------------------------------------------------------
echo    WATCH THE BOARD ^(http://127.0.0.1:8090^). One card per mind:
echo    what it is doing, and WHY it says it is doing it.
echo.
echo    Four of them are Kimi. Iseabail is scripted — she is your
echo    control. If a Kimi does something surprising, look at what
echo    she did in the same situation before believing it.
echo.
echo    Close all three black windows when you are done.
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
