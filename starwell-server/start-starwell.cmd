@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
set "TAILSCALE_IP=100.115.238.53"
set "HOST=0.0.0.0"
set "PORT=4173"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node was not found on this computer.
  echo Install the current Node release, then run this file again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node"') do set "NODE_VERSION=%%V"
for /f "tokens=1 delims=." %%V in ("%NODE_VERSION%") do set "NODE_MAJOR=%%V"

if defined NODE_MAJOR if %NODE_MAJOR% LSS 24 (
  echo.
  echo STARWELL requires Node 24 or newer.
  echo Found Node %NODE_VERSION%.
  echo Update Node, then run this file again.
  echo.
  pause
  exit /b 1
)

where tailscale >nul 2>nul
if not errorlevel 1 (
  for /f "usebackq delims=" %%I in (`tailscale ip -4 2^>nul`) do (
    if not defined TAILSCALE_FOUND (
      set "TAILSCALE_IP=%%I"
      set "TAILSCALE_FOUND=1"
    )
  )
)

if exist "%REPO_ROOT%\.git" (
  where git >nul 2>nul
  if not errorlevel 1 (
    pushd "%REPO_ROOT%"
    set "WORKTREE_DIRTY="
    for /f "delims=" %%S in ('git status --porcelain 2^>nul') do set "WORKTREE_DIRTY=1"

    if defined WORKTREE_DIRTY (
      echo.
      echo Hearthfire has local changes. Safe update skipped.
      echo Nothing was overwritten. Starting the current local copy.
    ) else (
      echo.
      echo Fetching the latest Hearthfire main branch...
      git pull --ff-only origin main
      if errorlevel 1 (
        echo.
        echo The safe pull did not complete. Starting the current local copy.
        echo No reset or destructive update was attempted.
      )
    )
    popd
  )
)

cd /d "%SCRIPT_DIR%"

echo.
echo =====================================================
echo   HEARTHFIRE ^> STARWELL PORTAL
necho   REI Mythience ^| Concordance Engine 0.2.0
echo =====================================================
echo.
echo Node:            %NODE_VERSION%
echo Local door:      http://127.0.0.1:%PORT%
echo Tailscale door:  http://%TAILSCALE_IP%:%PORT%
echo Health:          http://%TAILSCALE_IP%:%PORT%/health
echo REI contract:    http://%TAILSCALE_IP%:%PORT%/api/rei
echo Concordance:     http://%TAILSCALE_IP%:%PORT%/api/concordance/schema
echo.
echo Open the portal in Hearth Hall to reskin the room into STARWELL.
echo Keep this window open while the place is in use.
echo Press Ctrl+C to bank the fire.
echo.

node server.mjs

if errorlevel 1 (
  echo.
  echo STARWELL stopped with an error.
  pause
)

endlocal
