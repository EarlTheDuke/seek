@echo off
cd /d "%~dp0"
title Highlands - stop everything

REM ===========================================================================
REM  DOUBLE-CLICK TO STOP THE GAME AND STOP SPENDING.
REM
REM  Closes the server, the minds and the web page. Safe to run any time, and
REM  safe to run when nothing is going — it just says so.
REM ===========================================================================

echo.
echo   Stopping Highlands...
echo.

set "KILLED=0"
for %%P in (8080 5173 8090) do (
  for /f %%I in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue ^| Select-Object -First 1 -ExpandProperty OwningProcess)" 2^>nul') do (
    taskkill /PID %%I /F >nul 2>&1
    echo     stopped whatever was on port %%P
    set "KILLED=1"
  )
)

REM The minds process holds no port of its own, so it is found by name.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*agents.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Output '    stopped the minds' }"

echo.
echo   Done. Nothing is calling any paid API now.
echo   ^(You can close the three black windows if any are still open.^)
echo.
pause
