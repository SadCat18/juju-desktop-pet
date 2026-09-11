@echo off
chcp 65001 >nul
setlocal
call "%~dp0..\..\spine-poc\启动啾啾桌宠.cmd"
exit /b %errorlevel%


