# 啾啾独立桌面宿主

这是 WebView2 桌面宿主：WPF 提供无边框、置顶、托盘和本地窗口；页面内的 Spine 2D 由 WebGL GPU 绘制。

1. 双击 `启动啾啾桌宠.cmd`。
2. 启动脚本会编译 `JiuJiuSpinePet.exe`，需要本机存在 .NET Framework 4.x 编译器和 WebView2 runtime。
3. 右下角托盘图标可以重新显示或退出。

请不要直接双击 `legacy` 文件夹中的历史 EXE；它们不再使用当前的完整整帧资产，也不具备当前桌面交互修复。`JiuJiuSpinePet.exe` 是编译产物，推荐始终通过启动脚本运行。

宿主不要求 Node.js 运行；它内置了只服务当前 `spine-poc` 目录的本地 HTTP server。WebView2 程序集和原生 loader 来自 `vendor/webview2-package`，版本为 1.0.4191.47。
