OWNER_ROLE: desktop-pet
TASK_ID: desktop-pet
STATUS: in_progress
SCOPE: 持续完善啾啾桌宠的设置中心、养成体验、桌面交互与动画资产同步
EVIDENCE_DIR: spine-poc/qa
LAST_UPDATED: 2026-09-12T00:08:00+08:00

## Objective

当前版本使用无背带、无衣服的真实白狗初始造型；保留装备和衣服扩展到下一版本，并让网页、Spine 桌宠与 WPF 回退包保持一致。

## Completion criteria

- 当前运行时与稳定回退包的默认精灵表均为无背带版本。
- 喂食、喝水和玩球的回退动作不会重新显示旧背带。
- 分层 region 通过语法、产品、浏览器和桌面宿主回归。
- 已安装的 v2 `juju-real` 资源仍通过 atlas 校验。

## Scope boundaries

- In scope: `spine-poc/`、`outputs/xiaobai/`、`outputs/xiaobai-web/`、`outputs/xiaobai-desktop-pet/` 与本角色 checkpoint。
- Out of scope: `spine-poc/spine/spritesheet-with-gear-legacy.png` 历史备份；下一版本的装备/衣服系统设计与新素材生产。

## Current checkpoint

- Stage: Hatching 啾啾 / 桌面宿主启动收尾
- Status: 项目已迁移到 D 盘；无光晕、宠物悬停按钮、大小缩放、面板返回和紧凑命中区域均已回归通过
- Last verified action: 原生透明宿主由 `440×560` 收紧为 `380×420` DIPs；透明点击表面更接近宠物主体，保留拖动、悬停按钮和面板交互
- Next action: 等待下一轮啾啾素材或装备/衣服版本需求
- Verification: 项目根目录为 `D:\Work资源\desktop-pets\Jioj`；宿主已从新路径重编译并重启；`node --check`、产品自检、普通浏览器回归和 `JUJU_DESKTOP_MODE=1` 桌面回归均通过；桌面模式截图确认主体无舞台光晕、悬停显示按钮、离开隐藏

## Completed

- 现有 Spine 主精灵表已同步到 `outputs/xiaobai-desktop-pet/spritesheet.png`，并转换为 `outputs/xiaobai/spritesheet.webp` 与 `outputs/xiaobai-web/spritesheet.webp`；两个 WebP 回退文件 SHA-256 一致，均为 1536x2288 RGBA。
- `outputs/xiaobai/pet.json` 已移除“胸背带”描述，改为当前无装备初始造型。
- `outputs/xiaobai-desktop-pet/feeding-frames/` 与 `drinking-frames/` 已切换到无背带照片动作帧。
- WPF 回退 `playing-frames/` 已由无背带待机帧叠加现有小球 region 生成，避免旧装备回流。
- `spine/build-layered-assets.ps1` 收紧绿色边缘污染判断；重新生成的 7 个狗身体 region 绿色污染像素为 0，饭碗/水碗/小球的自身颜色保留。
- `spine-poc/README.md` 与回退包 README 已明确当前无背带、装备/衣服延后到下一版本。
- 根因复核：启动目录曾残留乱码命名的旧 EXE；输出包也暴露旧 PowerShell 宿主，旧实现会加载旧资产/旧动作映射并绕过 `?host=desktop`，因此可能出现分层错位、只摇晃、页面文字和点击/拖动失效。
- 已将旧乱码 EXE 移入 `spine-poc/desktop-host/legacy/stale-host-legacy.exe`，并将输出包的旧 PowerShell 宿主、旧动作帧和旧精灵表移入 `outputs/xiaobai-desktop-pet/legacy/`。
- `outputs/xiaobai-desktop-pet/spritesheet.png` 与 `outputs/xiaobai-web/spritesheet.png` 已同步为 `spine-poc/spine/spritesheet-clean.png`；输出包启动脚本改为复用唯一正式入口。
- `product-smoke.mjs` 已增加“旧宿主不得暴露、输出包必须复用正式入口”的防回归断言。
- 根启动器 `spine-poc/启动啾啾桌宠.cmd` 修复为 `HOST_DIR\\build...`、`HOST_DIR\\JiuJiu...`，并规范为 UTF-8 CRLF；此前 LF 行尾和缺少分隔符分别会导致命令被截断及 `desktop-hostbuild...` 路径错误。
- 输出包入口 `outputs/xiaobai-desktop-pet/启动啾啾桌宠.cmd` 规范为完整 UTF-8 CRLF；资源管理器等价命令从 `C:\Windows` 返回 0 并启动 `JiuJiuSpinePet.exe`。
- `spine-poc/index.html` 与 `app.js` 增加 `scale-range` 桌宠大小设置，实时更新 Spine skeleton 缩放并写入 `juju-pet-state-v2`；范围 70%–130%，步长 5%。
- `spine-poc/app.css` 将桌面模式右上角三按钮改为默认透明，仅 `.desktop-mode.pet-hover` 或键盘聚焦时显示；桌面舞台和伪元素均改为透明，移除整圈径向光晕。
- `spine-poc/app.js` 增加宠物 canvas 与按钮区域的 `pointerenter`/`pointerleave` 协同逻辑，保留 260ms 过渡时间避免从宠物移向按钮时断点。
- `spine-poc/qa/browser-regression.mjs` 增加桌面模式按钮显隐、计算样式、按钮过渡截图回归。
- 项目整体已从 `C:\Users\韩涵\Documents\Codex\2026-09-08\hatch-pet-codex` 移至 `D:\Work资源\desktop-pets\Jioj`；994 个文件、约 377 MB 移动完成，73 个 JSON 中的旧绝对路径已同步更新。

## Remaining

- 下一版本再引入可开关装备/衣服 attachment 或 skin，不改变当前默认皮肤。
- 如果要达到逐帧照片级还原，仍需要更多连续姿势素材或 Spine 网格权重/IK/物理骨骼工程。

## Blockers

- 当前用户需求无阻塞。历史备份仍保留背带是有意行为，避免破坏回溯素材。
- 当前 v2 接触表仍保留原始资产的少量边缘色差；确定性 despill 与 atlas validator 均为 `ok: true`，分层运行时已完成绿色污染清理。

## Coordination

- 下一版本装备系统应以独立可选 skin/attachment 实现，默认关闭；不得把背带或衣服重新烘焙进基础身体 region。

## Changed files

- `spine-poc/spine/build-layered-assets.ps1`: 收紧绿色边缘污染清理阈值。
- `outputs/xiaobai/pet.json`: 更新无装备描述。
- `spine-poc/README.md`: 更新主线与回退包同步说明。
- `outputs/xiaobai-desktop-pet/README.txt`: 记录当前无装备边界。
- `outputs/xiaobai-desktop-pet/spritesheet.png`, `outputs/xiaobai/spritesheet.webp`, `outputs/xiaobai-web/spritesheet.webp`: 同步/转换无背带 atlas。
- `outputs/xiaobai-desktop-pet/启动啾啾桌宠.cmd`: 复用 `spine-poc/启动啾啾桌宠.cmd` 的唯一正式启动链路。
- `outputs/xiaobai-desktop-pet/legacy/`: 隔离旧 PowerShell 宿主、旧动作帧和旧精灵表。
- `outputs/xiaobai-web/spritesheet.png`: 同步清理后的兼容 PNG。
- `spine-poc/desktop-host/legacy/stale-host-legacy.exe`: 隔离残留乱码旧宿主。
- `spine-poc/qa/product-smoke.mjs`: 增加入口隔离防回归检查。
- `spine-poc/qa/product-smoke.mjs`: 增加宠物悬停按钮、桌面透明舞台和离开事件防回归断言。
- `outputs/xiaobai-desktop-pet/feeding-frames/`, `drinking-frames/`, `playing-frames/`: 同步/生成无背带回退动作帧。
- `work/**/*.json`: 将运行记录、QA 证据和素材清单中的旧项目根路径更新为 D 盘新路径。
- `spine-poc/spine/rig-*.png`: 重新生成清理后的分层 region。
- `spine-poc/启动啾啾桌宠.cmd`: 修复绝对目录拼接与 Windows 批处理行尾。
- `spine-poc/launch-desktop-pet.cmd`, `spine-poc/启动Spine原型.cmd`: 规范批处理行尾。
- `outputs/xiaobai-desktop-pet/启动啾啾桌宠.cmd`: 规范批处理行尾，保持输出包入口指向正式启动链路。
- `spine-poc/index.html`, `spine-poc/app.js`, `spine-poc/app.css`: 增加桌宠大小缩放设置和桌面窗口按钮悬停显示。
- `spine-poc/index.html`, `spine-poc/app.js`, `spine-poc/app.css`: 照顾面板增加“返回桌宠”按钮和 Esc 关闭路径。
- `spine-poc/desktop-host/Main.cs`: 将桌面宿主透明命中窗口收紧为 `380×420` DIPs，减少对旁边桌面内容的遮挡。
- `spine-poc/qa/product-smoke.mjs`, `spine-poc/qa/browser-regression.mjs`: 增加缩放控件、实时更新、存档、宠物悬停显隐、桌面透明舞台、面板返回和截图回归断言。
- `spine-poc/qa/desktop-launch-*.png`: 任意工作目录启动、面板、握手、拖动、快捷喂食的视觉证据。

## Verification evidence

- `node --check .\\app.js`: 通过。
- `node .\\qa\\product-smoke.mjs`: 通过，9 个动作、分层快捷照顾、存档、桌面通信和 GPU Spine 入口均存在。
- `node .\\qa\\browser-regression.mjs`: 通过，Spine/GPU、动作、喂食、存档，实测约 238 FPS。
- `$env:JUJU_ACTION_RENDERER='photo-flow'; node .\\qa\\browser-regression.mjs`: 通过，照片动作回退模式，实测约 240 FPS。
- `node .\\qa\\runtime-visual-check.mjs`: 通过；8 个运行时动作截图均生成，附件诊断显示整帧 `pet` 或照片动作槽正确切换，无分层身体部件。
- 输出包启动实测：`outputs/xiaobai-desktop-pet/启动啾啾桌宠.cmd` 成功编译并启动 `JiuJiuSpinePet.exe`；新版窗口标题为 `啾啾 · Spine 2D 桌宠`，宿主进程响应。
- 桌面交互实测：面板按钮可点击，握手按钮更新状态并切换 active；窗口从 `(950,380)` 拖动到 `(1070,460)`，位移 `(120,80)`。
- `validate_atlas.py --require-v2`：已安装 `juju-real` 1536x2288 RGBA、spriteVersionNumber 2、透明 RGB 残留 0、errors/warnings 均为空。
- `cmd /c build-desktop-host.cmd`: 通过，生成 `desktop-host/啾啾Spine桌宠.exe`。
- 独立桌宠短启动：进程保持响应，测试进程已关闭。
- `cmd.exe /c 启动啾啾桌宠.cmd`: 通过，启动脚本正常返回；宿主进程响应，枚举到可见的“啾啾桌宠”窗口。
- 清理收尾：移除 `Main.cs` 临时 `host-startup.log` 调试日志代码并重新编译；旧乱码 EXE 已从启动目录隔离。
- `validate_atlas.py --require-v2`: `juju-real` 1536x2288 RGBA、spriteVersionNumber 2、无透明 RGB 残留、无错误和警告。
- 最新 `spine-poc/qa/layered-feeding.png`: 无背带，饭碗显示正常，喂食气泡正常。
- `node .\\qa\\runtime-visual-check.mjs`: 通过；8 个运行时动作截图均生成，附件诊断显示整帧 `pet` 或照片动作槽正确切换，无分层身体部件。
- 视觉回归截图：`spine-poc/qa/desktop-launch-regression.png`、`desktop-launch-panel-regression.png`、`desktop-launch-handshake-regression.png`、`desktop-launch-final-regression.png`、`desktop-launch-feeding-regression.png`；窗口无错误页，面板/握手/快捷动作可见。
- 物理交互回归：窗口从 `(950,380)` 拖到 `(1070,458)`，位移 `(120,78)`；握手点击后按钮变为 active，心情由 `74%` 变为 `76%`。
- 本轮 `node .\\qa\\product-smoke.mjs`、`node .\\qa\\browser-regression.mjs`、`node .\\qa\\runtime-visual-check.mjs` 全部通过；浏览器动作回归约 238 FPS。
- 桌面视觉证据：`desktop-buttons-hidden-final.png` 中按钮隐藏，`desktop-buttons-hover-final.png` 中悬停显示；`desktop-scale-setting.png` 显示大小设置，`desktop-scale-125.png` 显示 125% 滑杆状态，`desktop-scale-final.png` 显示宠物整体放大且姿态未变形。
- 最新桌面模式视觉证据：`desktop-hover-buttons-browser.png` 显示鼠标进入宠物后右上角三按钮出现且主体外无整圈光晕；`desktop-away-buttons-browser.png` 显示离开宠物后按钮隐藏。
- 最新桌面面板视觉证据：`desktop-panel-return-browser.png` 显示照顾面板标题栏右上角有“← 返回桌宠”控件。
- 面板导航回归：桌面模式打开面板后，点击“返回桌宠”可关闭并同步 `aria-expanded=false`；重新打开后按 Esc 也可关闭。
- 命中区域回归：宿主源码断言 `Width=380`、`Height=420`；重新编译后通过 Win32 顶层窗口实测为 `380×420`，实际进程来自 D 盘新宿主。
- 本轮命令：`node --check .\\app.js`、`node --check .\\qa\\browser-regression.mjs`、`node .\\qa\\product-smoke.mjs`、`node .\\qa\\browser-regression.mjs`、`$env:JUJU_DESKTOP_MODE='1'; node .\\qa\\browser-regression.mjs` 均通过；浏览器动作回归实测 226–240 FPS。
- 迁移后验证：在 `D:\\Work资源\\desktop-pets\\Jioj\\spine-poc` 启动 `server.mjs`，普通/桌面浏览器回归通过；从 `D:\\Work资源\\desktop-pets\\Jioj` 执行 `cmd.exe /d /c call .\\spine-poc\\启动啾啾桌宠.cmd` 成功生成并启动 `spine-poc\\desktop-host\\JiuJiuSpinePet.exe`。
- 回归结束已将运行中的桌宠大小恢复为默认 100%，并关闭照顾面板。

## Recovery note

- Interruption point: 当前版本无光晕与宠物悬停按钮需求已完成，项目已迁移到 `D:\\Work资源\\desktop-pets\\Jioj`，桌宠宿主正在运行，待后续装备/衣服版本需求。
- First action after recovery: 先检查本文件与 `spine-poc/README.md`，确认装备默认关闭，再从可选 skin/attachment 方案开始。
