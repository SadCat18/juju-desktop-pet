# 啾啾（Jioj）桌宠

一只基于 Spine 2D + WebGL 的真实白狗桌宠，一套资产跑三端：

| 入口 | 说明 |
|------|------|
| `spine-poc/启动啾啾桌宠.cmd` | **Windows 正式桌宠入口**：编译并启动透明、置顶、带托盘的 WPF + WebView2 宿主（可拖动、可打开照顾面板） |
| `spine-poc/启动Spine原型.cmd` | 浏览器体验版（`node server.mjs`，http://127.0.0.1:8765/ ） |
| `android-pet/` | Android 悬浮窗版（WebView + 前台服务，适配三星 One UI） |

## 目录结构

- `spine-poc/` — Web 原型与产品切片主体：`app.js`（全部运行时逻辑）、`index.html`、`app.css`、`spine/`（骨架/图集/分层素材与构建脚本）、`desktop-host/`（Windows 宿主源码 `Main.cs` 与编译脚本）、`vendor/`（Spine runtime 与 WebView2 包）、`qa/`（冒烟/回归脚本与视觉证据）
- `android-pet/` — Android 工程（资产在 `app/src/main/assets/`，与 spine-poc 手工同步，见整改计划阶段 0）
- `outputs/` — 发行包（`xiaobai-desktop-pet/` 桌面分发包、`xiaobai-web/`）与素材产物
- `work/`、`.codex/` — 历史工作区与 agent 进度记录（`.codex/progress/` 为项目 checkpoint）
- `qa/` — 素材处理脚本

## 上手与整改

- **接手开发前必读 [`整改计划.md`](./整改计划.md)**：审计问题清单（含 P0 死局）、分阶段任务、回归命令、GitHub 上传交接。
- 开发自检：`node --check spine-poc/app.js`、`cd spine-poc && node qa/product-smoke.mjs`
- 红线：`.cmd/.bat` 保持 CRLF；不要运行任何 `legacy/` 目录里的历史宿主；功能描述以代码为准。
