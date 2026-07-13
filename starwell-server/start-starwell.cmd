@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node was not found on this computer.
  echo Install the current Node release, then run this file again.
  echo.
  pause
  exit /b 1
)

set HOST=0.0.0.0
set PORT=4173

echo.
echo ==============================================
echo   STARWELL within Hearthfire
echo ==============================================
echo.
echo Local door:     http://127.0.0.1:4173
echo Tailscale door: http://100.115.238.53:4173
echo Health:         http://100.115.238.53:4173/health
echo.
echo Keep this window open while STARWELL is in use.
echo Press Ctrl+C to bank the fire.
echo.

node server.mjs

if errorlevel 1 (
  echo.
  echo STARWELL stopped with an error.
  pause
)

endlocal
