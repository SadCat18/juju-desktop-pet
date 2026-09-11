@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set "WV2=..\vendor\webview2-package\lib\net462"
set "EXE=%~dp0JiuJiuSpinePet.exe"
set "HOST_SOURCE=%~dp0Main.cs"
set "HOST_BUILD_SCRIPT=%~f0"
if not exist "%CSC%" (
  echo 找不到 .NET Framework C# 编译器：%CSC%
  exit /b 1
)
if not exist "%WV2%\Microsoft.Web.WebView2.Wpf.dll" (
  echo 找不到 WebView2 程序集：%WV2%
  exit /b 1
)
if not exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll" (
  echo 找不到 JSON 序列化程序集：System.Web.Extensions.dll
  exit /b 1
)
if not exist "%EXE%" goto compile_host
"%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$exe=Get-Item -LiteralPath $env:EXE; $source=Get-Item -LiteralPath $env:HOST_SOURCE; $script=Get-Item -LiteralPath $env:HOST_BUILD_SCRIPT; exit [int]($source.LastWriteTimeUtc -gt $exe.LastWriteTimeUtc -or $script.LastWriteTimeUtc -gt $exe.LastWriteTimeUtc)"
if errorlevel 1 goto compile_host
echo 宿主已是最新，跳过 csc 编译：%EXE%
exit /b 0

:compile_host

"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /out:"JiuJiuSpinePet.exe" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationCore.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\WindowsBase.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationFramework.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Xaml.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Drawing.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Windows.Forms.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll" /reference:"%WV2%\Microsoft.Web.WebView2.Core.dll" /reference:"%WV2%\Microsoft.Web.WebView2.Wpf.dll" Main.cs
if errorlevel 1 exit /b 1

copy /y "%WV2%\Microsoft.Web.WebView2.Core.dll" "." >nul
copy /y "%WV2%\Microsoft.Web.WebView2.Wpf.dll" "." >nul
copy /y "..\vendor\webview2-package\runtimes\win-x64\native\WebView2Loader.dll" "." >nul
echo 已生成：%CD%\JiuJiuSpinePet.exe
