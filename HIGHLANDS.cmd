@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands

REM ===========================================================================
REM  THE FRONT DOOR. Double-click this and pick what you want to do.
REM
REM  Everything here is also a file you can double-click directly (PLAY.cmd,
REM  PLAY-KOTH.cmd, STOP.cmd...) — this menu just saves you knowing which.
REM  INSTALL.cmd puts a shortcut to this file on the desktop.
REM ===========================================================================

:menu
cls
echo.
echo    H I G H L A N D S
echo    -----------------
echo.
REM  Say at a glance whether AI minds are possible yet, without printing keys.
set "KEYSTATE=no keys set up yet - option 1 works without any"
if exist "keys.cmd" (
  call ".\keys.cmd" >nul 2>&1
  set "HAVE="
  if defined XAI_API_KEY set "HAVE=!HAVE! xAI"
  if defined ANTHROPIC_API_KEY set "HAVE=!HAVE! Anthropic"
  if defined TINYBOX_API_KEY set "HAVE=!HAVE! tinybox"
  if defined HAVE (set "KEYSTATE=keys set:!HAVE!") else set "KEYSTATE=keys.cmd exists but is empty - option 1 works without any"
)
echo    %KEYSTATE%
echo.
echo    [1]  Play the world SOLO           free - no API keys needed
echo    [2]  Survival with AI minds        six AI players share your world
echo    [3]  KING OF THE HILL match        red vs blue, you are on blue
echo    [4]  Set up API keys               where to get them, what they cost
echo    [5]  Check my keys                 free - sends no prompts
echo    [6]  STOP everything               closes the game, stops the money
echo.
echo    [Q]  Quit
echo.
choice /c 123456Q /n /t 600 /d Q /m "   Pick one: "
if errorlevel 7 goto done
if errorlevel 6 (start "Highlands - stop" cmd /c STOP.cmd & goto pause_menu)
if errorlevel 5 (start "Highlands - key check" cmd /c CHECK-KEYS.cmd & goto pause_menu)
if errorlevel 4 (call SETUP-KEYS.cmd & goto menu)
if errorlevel 3 (start "Highlands - king of the hill" cmd /c PLAY-KOTH.cmd & goto done)
if errorlevel 2 (start "Highlands - survival" cmd /c PLAY.cmd & goto done)
if errorlevel 1 (start "Highlands - solo" cmd /c PLAY-SOLO.cmd & goto done)
goto menu

:pause_menu
timeout /t 2 /nobreak >nul
goto menu

:done
endlocal
exit /b 0
