@echo off
cd /d "%~dp0"
title Highlands - checking your keys

REM ===========================================================================
REM  DOUBLE-CLICK THIS AFTER PASTING YOUR KEYS INTO keys.cmd.
REM
REM  It asks each provider what models it offers. That one question proves
REM  three things at once: the key is real, the address is right, and the model
REM  name in roster.json is one that provider actually has.
REM
REM  It sends no prompts and spends no tokens.
REM ===========================================================================

echo.
if not exist "keys.cmd" (
  echo   There is no keys.cmd yet. Run PLAY.cmd once and it will make you one,
  echo   or copy keys.example.cmd and rename the copy to keys.cmd.
  echo.
  pause
  exit /b 1
)

REM  `.\` on purpose. Some shells run with NoDefaultCurrentDirectoryInExePath
REM  set, and then `call keys.cmd` fails with "not recognized" even though the
REM  file is right there — which reads as "your keys are empty" and is not.
call ".\keys.cmd"
call npm run keycheck

echo.
pause
