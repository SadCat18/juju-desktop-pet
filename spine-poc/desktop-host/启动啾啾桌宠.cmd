@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem Build only when Main.cs or this script is newer than the host executable.
call "%~dp0build-desktop-host.cmd"
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist "%~dp0JiuJiuSpinePet.exe" (
  echo 找不到桌宠宿主：%~dp0JiuJiuSpinePet.exe
  pause
  exit /b 1
)
start "" /d "%~dp0" "%~dp0JiuJiuSpinePet.exe"
