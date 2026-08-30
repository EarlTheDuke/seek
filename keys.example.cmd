@echo off
REM ===========================================================================
REM  COPY THIS FILE, RENAME THE COPY TO  keys.cmd , AND PASTE YOUR KEYS BELOW.
REM
REM  keys.cmd is gitignored. It never gets committed and never leaves this
REM  machine. This file (keys.example.cmd) IS committed, so keep it empty.
REM
REM  Paste each key between the quotes. No spaces around the = sign.
REM  A key you do not have: leave it empty. That player becomes SCRIPTED and
REM  the startup header says so beside their name.
REM ===========================================================================

REM  xAI / Grok - most seats in the match rosters.  https://console.x.ai
set "XAI_API_KEY="

REM  Anthropic / Claude - the Claude seats in roster.json.  https://console.anthropic.com
set "ANTHROPIC_API_KEY="

REM  Your own local box (any OpenAI-compatible server, e.g. Open WebUI) - the
REM  kimi seats. Point the roster baseUrl at yours, or leave this empty.
set "TINYBOX_API_KEY="

REM  Only needed if you add a hosted Moonshot/Kimi seat to roster.json.
set "MOONSHOT_API_KEY="
