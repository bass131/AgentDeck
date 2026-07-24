@echo off
rem ============================================================
rem  OpenGate CLOSE (ADR-038) - RUN BY YEONGHO ONLY.
rem  Effect: .claude/settings.json <- settings.SEALED.json
rem          + delete gate-open.flag
rem  NOTE: permanent settings.json changes made during the
rem        window are kept ONLY if both canonicals were updated.
rem ============================================================
set "HERE=%~dp0"
copy /Y "%HERE%settings.SEALED.json" "%HERE%..\..\.claude\settings.json" >nul
if errorlevel 1 (echo [OpenGate] FAIL: could not restore settings.json & pause & exit /b 1)
if exist "%HERE%gate-open.flag" del "%HERE%gate-open.flag"
echo [OpenGate] CLOSED (sealed).
echo [OpenGate] Checklist: seal probe / CHANGELOG [H] entry / hooks check.
pause
