@echo off
setlocal
cd /d "%~dp0"
set "SOLITAIR_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "SOLITAIR_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo SolitAir needs Node.js 22.13 or newer. Install Node.js, then run this launcher again.
    pause
    exit /b 1
  )
)
"%SOLITAIR_NODE%" "%~dp0tools\launch.mjs" %*
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
endlocal
