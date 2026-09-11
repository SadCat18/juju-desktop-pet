@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，请先安装 Node.js 20 或更高版本。
  pause
  exit /b 1
)
node .\server.mjs --open
