OWNER_ROLE: backend
TASK_ID: backend
STATUS: complete
SCOPE: 负责 WPF 桌面宿主、Android 原生宿主与其启动/原生说明；不修改前端运行时、QA、同步脚本或前端文档。
EVIDENCE_DIR: spine-poc/qa
LAST_UPDATED: 2026-09-12T01:55:50+08:00

## Objective

完成《整改计划.md》中后端/宿主相关事项：WPF 通知、桌面交互配合、全屏/锁屏感知、宿主存档与 JSON 通道、托盘图标、即时位置保存/多显示器边界、生命周期；Android 安全 WebView 加载、非焦点悬浮窗、One UI/暗色/刘海/前台服务兼容，以及充电/低电量问候的优雅降级。所有启动脚本按要求保持 UTF-8、CRLF，并避免不必要的宿主编译。

## Completion criteria

- WPF 宿主可接收字符串与 JSON notify、窗口命令、状态保存消息，并用当前 `spine/rig-head.png` 生成托盘图标和 balloon；CoreWebView2 通过 `PostWebMessageAsJson` 向页面发送 JSON。
- 全屏/忙碌与锁屏状态会取消置顶并向页面发出 `paused`/`reduceMotion`；锁屏发送 sleeping，解锁发送本地时段问候；位置按所在显示器 `Screen.WorkingArea` clamp 并 debounce 保存。
- `%LOCALAPPDATA%\\JiuJiuSpinePet\\pet-state.json` 经过 UTF-8、大小、对象分段和数值范围校验后原子写入，导航完成后 JSON 回灌。
- Android 已使用 `WebViewAssetLoader` HTTPS 资产通道、`FLAG_NOT_FOCUSABLE`，并保留 One UI/暗色/刘海/前台服务适配；电池接收器注册或页面下发失败均静默降级。
- 宿主/Android 原生说明已同步；7 个非 legacy `.cmd/.bat` 均含 `chcp 65001 >nul` 且核验为 CRLF；csc 仅在 `Main.cs` 或构建脚本比 exe 新时运行。
- Node 三项 QA、宿主真实编译/启动和静态边界核验均有证据；Android assembleDebug 已真实通过并生成 APK。

## Scope boundaries

- In scope: `spine-poc/desktop-host/Main.cs`, `spine-poc/desktop-host/README.md`, `spine-poc/desktop-host/*.cmd`, `spine-poc/启动啾啾桌宠.cmd`, `spine-poc/launch-desktop-pet.cmd`, `outputs/xiaobai-desktop-pet/启动啾啾桌宠.cmd`, `android-pet/app/src/main/java/`, Android Gradle/native README and Android wrapper script.
- Out of scope: `spine-poc/app.js`, `spine-poc/index.html`, `spine-poc/app.css`, `spine-poc/qa/`, Android `app/src/main/assets/` copies, Android asset sync script, frontend docs, GitHub remote/commit/push, and every `legacy/` host.

## Current checkpoint

- Stage: 后端宿主与 Android 原生实现收尾
- Status: 后端允许范围内代码、脚本、原生说明及验证均已完成。
- Last verified action: 总指挥真实执行 `android-pet\\gradlew.bat assembleDebug`，Gradle 报 `BUILD SUCCESSFUL`、完成 32 tasks，并生成 APK。
- Next action: 由 coordinator 进行最终整合，核对全体角色 checkpoint、改动与最终回归证据。
- Verification: 宿主编译/启动通过；Node 全量通过；Android assembleDebug 通过并已确认 APK 产物。

## Completed

- 读取 `project-checkpoint` 与 `ponytail` 规范。
- 完整读取根目录 `README.md` 与 `整改计划.md`。
- 读取 `.codex/progress/desktop-pet.md` 作为只读协调材料；未修改该文件或前端边界。
- 确认现有 WebView2 页面协议和 Android 原生调用链，识别前端必须配合的双向消息事件。
- WPF 宿主实现通知、结构化 WebMessage、系统状态/会话、存档、托盘、位置 debounce/clamp 与生命周期清理。
- Android 原生实现安全资产加载、非焦点悬浮窗与充电/低电量问候优雅降级；更新 AndroidX WebKit 配置与原生说明。
- 所有允许范围内启动脚本加入 UTF-8 codepage 设置并逐个核验 CRLF；宿主构建脚本加入时间戳跳过逻辑并真实验证编译与跳过两条路径。
- 执行适用 Node QA、宿主编译/启动、Android assembleDebug；按真实结果区分通过和环境阻塞。

## Remaining

- 后端范围内无剩余事项。

## Blockers

- 无。前端协议协调项已提供，Gradle 构建阻塞已解除。

## Coordination

- JS → WPF/Android：保留现有字符串 `drag-window`、`close-window`、`minimize-window`、`panel-open`、`panel-close`；新增 `{ "type":"notify", "message":"..." }`、`{ "type":"state-save", "state":{...} }`，可选 `{ "type":"pet-action", "action":"petting|handshake|..." }`。
- WPF → JS：使用 `CoreWebView2.PostWebMessageAsJson` 发送 `{ "type":"host-state", "event":"restore-state", "state":{...} }`、`{ "type":"host-state", "event":"system-mode", "paused":true|false, "reduceMotion":true|false, "reason":"fullscreen|locked|normal" }`、`{ "type":"host-state", "event":"session-lock", "animation":"sleeping", "paused":true, "reduceMotion":true }`、`{ "type":"host-state", "event":"session-unlock", "greeting":"...", "paused":<systemBusy>, "reduceMotion":<systemBusy> }`。
- Android → JS：用 `window.postMessage(<same JSON>, '*')` 发 `{ "type":"host-state", "event":"battery", "level":0..100, "charging":true|false, "greeting":"..." }`；仅在充电边沿/低电量边沿问候，读取失败静默降级。
- 前端接入点：监听 `chrome.webview` 的 `message` 事件与 Android `window` `message` 事件；恢复状态应合并到 `juju-pet-state-v2` 并在后续 `saveState()` 回传宿主。

## Changed files

- `.codex/progress/backend.md`: 本角色的唯一持久 checkpoint。
- `spine-poc/desktop-host/Main.cs`: WPF 宿主 JSON 通道、通知、系统/会话状态、存档、位置与生命周期。
- `spine-poc/desktop-host/build-desktop-host.cmd`: UTF-8、时间戳条件编译与 JSON 程序集引用。
- `spine-poc/desktop-host/启动啾啾桌宠.cmd`, `spine-poc/启动啾啾桌宠.cmd`, `spine-poc/launch-desktop-pet.cmd`, `spine-poc/启动Spine原型.cmd`, `outputs/xiaobai-desktop-pet/启动啾啾桌宠.cmd`: UTF-8 codepage/CRLF 启动链路。
- `spine-poc/desktop-host/README.md`: 现行宿主功能与协议说明。
- `android-pet/app/src/main/java/com/jiujiu/pet/PetOverlayService.java`: Android 安全 WebView、悬浮窗焦点与电池问候降级。
- `android-pet/app/build.gradle`, `android-pet/gradle.properties`, `android-pet/README.md`, `android-pet/gradlew.bat`: AndroidX WebKit 配置、原生说明与脚本编码。

## Verification evidence

- `Get-Content -Raw README.md` 与 `Get-Content -Raw 整改计划.md`: 已完整读取。
- `cmd.exe /d /c call .\\build-desktop-host.cmd`: 通过，真实 csc 生成 `spine-poc/desktop-host/JiuJiuSpinePet.exe`。
- 再次执行同一构建命令：通过，输出“宿主已是最新，跳过 csc 编译”。
- `cmd.exe /d /c call .\\启动啾啾桌宠.cmd`: 通过；进程路径核对为 `D:\\Work资源\\desktop-pets\\Jioj\\spine-poc\\desktop-host\\JiuJiuSpinePet.exe`，随后已停止测试进程。
- `node --check spine-poc\\app.js`: 通过。
- `cd spine-poc; node .\\qa\\product-smoke.mjs`: 通过（9 个整帧动作、照片补帧、状态存档、桌面宿主通信、GPU Spine 入口）。
- `cd spine-poc; node .\\qa\\browser-regression.mjs`: 通过（Spine/GPU、9 个动作、存档；实测约 220 FPS）。
- `cd spine-poc; node .\\qa\\runtime-visual-check.mjs`: 通过，退出码 0，动作截图/附件检查完成。
- `cd android-pet; .\\gradlew.bat assembleDebug`: 通过；总指挥真实记录 `BUILD SUCCESSFUL`、`32 actionable tasks`，APK 产物为 `android-pet/app/build/outputs/apk/debug/app-debug.apk`。
- 7 个非 legacy `.cmd/.bat`: `LF == CRLF`，均含 `chcp 65001 >nul`。
- 静态边界断言：WPF notify/balloon、CoreWebView2 JSON、SHQuery/会话、原子存档、Screen.WorkingArea、宠物托盘图标、Android AssetLoader、非焦点、去除 file URL 高权限、电池降级均 PASS；`git diff --check` 无错误。

## Recovery note

- Interruption point: 后端实现与全部适用验证已完成，当前正式宿主测试进程已停止。
- First action after recovery: 由 coordinator 进行最终整合，核对全体角色 checkpoint、改动与最终回归证据。
