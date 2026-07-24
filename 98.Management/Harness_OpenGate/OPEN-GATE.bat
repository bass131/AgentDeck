@echo off
rem ============================================================
rem  OpenGate OPEN (ADR-038) - RUN BY YEONGHO ONLY.
rem  Agents are denied from this folder (seal + hook).
rem  Effect: .claude/settings.json <- settings.OPEN.json
rem          + gate-open.flag (epoch seconds, TTL 4h in hook)
rem ============================================================
set "HERE=%~dp0"
copy /Y "%HERE%settings.OPEN.json" "%HERE%..\..\.claude\settings.json" >nul
if errorlevel 1 (echo [OpenGate] FAIL: could not replace settings.json & pause & exit /b 1)
for /f %%t in ('powershell -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()"') do set "EPOCH=%%t"
if not defined EPOCH (echo [OpenGate] FAIL: could not get epoch time & pause & exit /b 1)
>"%HERE%gate-open.flag" echo %EPOCH%
echo [OpenGate] OPEN. TTL = 4 hours (hook auto-reseals after expiry).
echo [OpenGate] When finished: run CLOSE-GATE.bat, then CHANGELOG [H] + probe.
pause
