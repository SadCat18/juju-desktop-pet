@echo off
setlocal
cd /d "%~dp0"
set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set "WV2=..\vendor\webview2-package\lib\net462"
if not exist "%CSC%" (
  echo 找不到 .NET Framework C# 编译器：%CSC%
  exit /b 1
)
if not exist "%WV2%\Microsoft.Web.WebView2.Wpf.dll" (
  echo 找不到 WebView2 程序集：%WV2%
  exit /b 1
)

"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /out:"JiuJiuSpinePet.exe" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationCore.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\WindowsBase.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationFramework.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Xaml.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Drawing.dll" /reference:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Windows.Forms.dll" /reference:"%WV2%\Microsoft.Web.WebView2.Core.dll" /reference:"%WV2%\Microsoft.Web.WebView2.Wpf.dll" Main.cs
if errorlevel 1 exit /b 1

copy /y "%WV2%\Microsoft.Web.WebView2.Core.dll" "." >nul
copy /y "%WV2%\Microsoft.Web.WebView2.Wpf.dll" "." >nul
copy /y "..\vendor\webview2-package\runtimes\win-x64\native\WebView2Loader.dll" "." >nul
echo 已生成：%CD%\JiuJiuSpinePet.exe
