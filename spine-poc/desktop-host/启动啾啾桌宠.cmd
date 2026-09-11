@echo off
setlocal
cd /d "%~dp0"
rem Always rebuild the small host so a copied folder cannot silently launch a stale binary.
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
