@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Highlands - install

REM ===========================================================================
REM  DOUBLE-CLICK TO INSTALL. This is the only file a new person has to find.
REM
REM  It checks for Node (installing it with winget if missing), fetches the
REM  game's packages, makes you a keys file, puts a Highlands shortcut on the
REM  desktop, and opens the menu. Run it again any time - every step skips
REM  itself when its work is already done.
REM
REM  Nothing here needs an API key. Solo play is free forever; keys are only
REM  for giving the OTHER players minds, and the menu explains them.
REM ===========================================================================

echo.
echo   HIGHLANDS - install
echo   -------------------
echo.

REM ---- 1. Node ---------------------------------------------------------------
where node >nul 2>&1
if not errorlevel 1 goto node_ok

echo   Node.js is not installed. Trying to install it automatically...
where winget >nul 2>&1
if errorlevel 1 goto node_manual

winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
REM  winget cannot update THIS window's PATH, so reach for the usual spot.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%PATH%;%ProgramFiles%\nodejs"
where node >nul 2>&1
if not errorlevel 1 goto node_ok

:node_manual
echo.
echo   Could not install Node automatically. It is one click by hand:
echo     1. The Node.js site is opening - press the big green LTS button.
echo     2. Run the file it downloads, click Next until done.
echo     3. Double-click INSTALL.cmd again.
echo.
start "" "https://nodejs.org"
pause
exit /b 1

:node_ok
for /f "delims=" %%v in ('node --version') do echo   Node %%v - good.

REM ---- 2. the game's packages ------------------------------------------------
if exist "node_modules" (
  echo   Packages already installed - good.
) else (
  echo   Fetching packages. This takes a minute the first time...
  call npm install || goto :failed
)

REM ---- 3. a keys file, ready for later ---------------------------------------
if not exist "keys.cmd" (
  copy /y "keys.example.cmd" "keys.cmd" >nul 2>&1
  echo   Made keys.cmd - empty is fine, solo play needs no keys.
) else (
  echo   keys.cmd already exists - left alone.
)

REM ---- 4. a shortcut on the desktop -------------------------------------------
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Highlands.lnk');" ^
  "$s.TargetPath='%~dp0HIGHLANDS.cmd'; $s.WorkingDirectory='%~dp0'; $s.Description='Highlands - a world with minds in it'; $s.Save()"
if errorlevel 1 (echo   Could not make the desktop shortcut - HIGHLANDS.cmd in this folder is the same thing.) else echo   Desktop shortcut made: Highlands.

echo.
echo   ---------------------------------------------------------------
echo    INSTALLED. The menu is opening now, and the Highlands
echo    shortcut on your desktop reopens it any time.
echo.
echo    [1] on the menu plays free, right now, no keys.
echo    [4] explains API keys when you want AI minds in your world.
echo    STOP.cmd (or [6]) always stops everything.
echo   ---------------------------------------------------------------
echo.
timeout /t 4 /nobreak >nul
start "Highlands" cmd /c HIGHLANDS.cmd
exit /b 0

:failed
echo.
echo   Package install failed. Check your internet connection and run
echo   INSTALL.cmd again - it is safe to re-run.
echo.
pause
exit /b 1
