@echo off
setlocal
cd /d "%~dp0"
title Highlands - API keys

REM ===========================================================================
REM  SET UP THE KEYS THAT GIVE THE OTHER PLAYERS MINDS.
REM
REM  Everything is optional. With no keys at all, solo play works completely
REM  and any AI seat simply runs SCRIPTED (a decent built-in brain, free).
REM  Keys live in keys.cmd, which is gitignored: it never gets committed and
REM  never leaves this machine.
REM ===========================================================================

if not exist "keys.cmd" copy /y "keys.example.cmd" "keys.cmd" >nul 2>&1

echo.
echo   HIGHLANDS - API keys
echo   --------------------
echo.
echo   The AI players ("minds") each run on a model you bring a key for.
echo   ALL KEYS ARE OPTIONAL - a seat without one plays scripted, for free.
echo.
echo     XAI_API_KEY         Grok models        https://console.x.ai
echo     ANTHROPIC_API_KEY   Claude models      https://console.anthropic.com
echo     TINYBOX_API_KEY     your own local box (only if you run one)
echo.
echo   Rough cost with keys: about 1 to 2 dollars per HOUR for a full table,
echo   and every run has a hard budget cap it cannot spend past. STOP.cmd
echo   always stops the money instantly.
echo.
echo   Notepad will open next. Paste each key BETWEEN THE QUOTES on its line,
echo   save, and close Notepad to continue. Leave anything you do not have
echo   empty.
echo.
pause

start /wait notepad "keys.cmd"

echo.
choice /c YN /n /t 60 /d N /m "  Check the keys now? It is free and sends no prompts. [Y/N] "
if errorlevel 2 goto done

call ".\keys.cmd"
call npm run keycheck
echo.
pause

:done
endlocal
exit /b 0
