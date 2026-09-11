# 啾啾独立桌面宿主

这是 WebView2 桌面宿主：WPF 提供无边框、置顶、托盘和本地窗口；页面内的 Spine 2D 由 WebGL GPU 绘制。

1. 双击 `启动啾啾桌宠.cmd`。
2. 启动脚本仅在 `Main.cs` 或启动脚本比 `JiuJiuSpinePet.exe` 更新时编译，需要本机存在 .NET Framework 4.x 编译器和 WebView2 runtime。
3. 右下角托盘图标可以重新显示或退出。

请不要直接双击 `legacy` 文件夹中的历史 EXE；它们不再使用当前的完整整帧资产，也不具备当前桌面交互修复。`JiuJiuSpinePet.exe` 是编译产物，推荐始终通过启动脚本运行。

宿主不要求 Node.js 运行；它内置了只服务当前 `spine-poc` 目录的本地 HTTP server。WebView2 程序集和原生 loader 来自 `vendor/webview2-package`，版本为 1.0.4191.47。

## 宿主配合

- 页面可继续发送字符串 `drag-window`、`close-window`、`minimize-window`、`show-window`、`panel-open` 和 `panel-close`。
- 页面也可发送 JSON：`{"type":"notify","message":"..."}` 显示托盘 balloon，或 `{"type":"state-save","state":{...}}` 原子保存存档。
- 宿主从 `%LOCALAPPDATA%\JiuJiuSpinePet\pet-state.json` 读取通过大小/结构校验的存档，在页面导航完成后以 `restore-state` JSON 回灌。
- 宿主通过 `CoreWebView2.PostWebMessageAsJson` 发送 `system-mode`、`session-lock` 和 `session-unlock`：全屏/忙碌或锁屏时 `paused=true`、`reduceMotion=true`，并取消窗口置顶；解锁会发送按本地时段生成的问候。
- 位置变更会 debounce 后即时保存，恢复与移动都按当前窗口所在显示器的 `Screen.WorkingArea` clamp。托盘图标优先使用当前 `spine/rig-head.png`，缺失时才回退系统图标。
