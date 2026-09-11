@echo off
chcp 65001 >nul
setlocal
call "%~dp0启动啾啾桌宠.cmd"
exit /b %errorlevel%
