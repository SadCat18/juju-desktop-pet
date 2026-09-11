@echo off
chcp 65001 >nul
setlocal
set "HOST_DIR=%~dp0desktop-host"
call "%HOST_DIR%\build-desktop-host.cmd"
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist "%HOST_DIR%\JiuJiuSpinePet.exe" (
  echo 找不到桌宠宿主：%HOST_DIR%\JiuJiuSpinePet.exe
  pause
  exit /b 1
)
start "" /d "%HOST_DIR%" "%HOST_DIR%\JiuJiuSpinePet.exe"
exit /b 0
