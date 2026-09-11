OWNER_ROLE: frontend
TASK_ID: full-remediation-2026-09-12
STATUS: complete
SCOPE: 在规定前端边界内完成整改计划阶段 0–5 的 Web/UI/客户端状态/资产同步/前端 QA，并维护跨角色协调项。
EVIDENCE_DIR: spine-poc/qa
LAST_UPDATED: 2026-09-12T00:31:00+08:00

## Objective

让 Web 原型与 Android Web 资产具备真实、可恢复的养成闭环、桌面/移动交互、存档导入导出、可访问的趣味功能，并让文档、诊断和 QA 与实际代码一致；不修改后端 agent 独占文件、不运行 legacy、不提交或推送 git。

## Completion criteria

- 阶段 1：库存按本地日补给且有上限；连续 60 秒衰减、离线按 `lastUpdated`、各维 ≥15 保底、低值提醒/等待/宿主外呼均真实可达。
- 阶段 2：客户端区分单击/双击/拖动，提供 HTML 右键菜单，并消费宿主暂停/降帧/锁屏/时段消息。
- 阶段 3：Web 文档如实；删除死 actionMesh/假诊断；渲染档位真实有效。
- 阶段 4：面板支持导出/导入，Android Web 资产由同步脚本生成并保留移动 Esc/返回行为。
- 阶段 5：在现有资产安全范围内实现声音、可见清洁/装备/小球、桌面漫步、成长成就；可选服务仅本地安全占位并如实说明；不可应用的完整分层 rig/网格不伪称已启用。
- 前端相关 node 检查、产品/浏览器/运行时 QA、Android Web 资产同步校验均有真实通过证据；无提交/推送。

## Scope boundaries

- In scope: `spine-poc/app.js`, `spine-poc/index.html`, `spine-poc/app.css`, `spine-poc/scripts/sync-android-assets.mjs` 及生成的 `android-pet/app/src/main/assets/` Web 资产，`spine-poc/qa/` Web/UI/状态回归脚本，`spine-poc/README.md`、`android-pet/README.md` Web/资产同步说明，`.codex/progress/frontend.md`。
- Out of scope: `spine-poc/desktop-host/Main.cs`、Android Java/Gradle、宿主构建脚本、`outputs/xiaobai-desktop-pet/README.txt`；需求已写入协调项交由对应角色。

## Current checkpoint

- Stage: frontend implementation and verification complete
- Status: complete
- Last verified action: 修正 backend 协议兼容（`reduceMotion`、`restore-state`、`session-lock/unlock`、结构化 `notify/state-save`）后，串行重跑普通与桌面浏览器回归均通过。
- Next action: 由 coordinator 审阅并整合 backend/Android 原生改动后执行最终宿主与 Android 构建验收；本 frontend 角色无待实施动作。
- Verification: node 检查、`product-smoke.mjs`、普通/桌面 `browser-regression.mjs`、`runtime-visual-check.mjs`、Android Web 资产 `--check` 全部 exit 0。

## Completed

- 阶段 1：`currentDay()` 使用本地年月日；每日食物/饮水各 +5、上限各 10；`setInterval(60000)` 驱动衰减；离线折算保底 15；低饥饿/口渴显示气泡、切 waiting 并发送 `notify:...` 和结构化 notify；完成动作显示消耗和剩余库存。
- 阶段 2：画布按 8px 移动阈值区分拖动，未移动单击摸头，300ms 内二击触发 running 跳跳；右键为 HTML 菜单；接收宿主暂停/降帧/锁屏/解锁/时段/电量问候并在暂停/锁屏停止推进、夜间睡觉。
- 阶段 3：移除 `setLayeredActionPose`、`applyActionMeshPose`、运行时 action-mesh 加载及假激活诊断；保留实际照片双槽过渡；30/60/90 FPS 更新档位按 `targetInterval` 生效；Web README 已按实际单 root 资产重写。
- 阶段 4：加入安全的 JSON 导出/导入（512KiB 限制、字段归一化、失败提示、未知字段忽略）；新增同步脚本，重建 Android Web assets 并支持 `--check`；Android README 记录单一来源和移动 Esc/返回路径。
- 阶段 5：用 Web Audio API 实现动作提示音与静音/音量设置；清洁度低于 40 显示污渍 overlay；提供默认关闭的本地小花领巾装饰；小球拖掷/点击互动；桌面模式空闲漫步；XP/等级/四项成就；LLM/跨设备仅离线本地占位且页面明示未接入。
- QA：更新产品 smoke 与浏览器回归断言，覆盖新控件、协议、低值保底、跨日补给、动作网格未激活和 Android 资产同源。

## Remaining

- frontend scope has no remaining implementation work.
- 完整分层骨骼、网格权重、IK/物理仍需真实 Spine 资产；当前源 `full-pet.json` 只有 `root` 与 `pet/real-action/real-action-next`，已如实记录而未伪造。
- backend/Android 原生阶段、宿主最终构建和输出包旧 README 由 coordinator/backend 角色负责。

## Blockers

- backend checkpoint 仍为 `in_progress`，其 WPF/Android 改动及 Android Gradle 构建尚未由本角色验证；最终整合需要 coordinator 串行验收。
- `outputs/xiaobai-desktop-pet/README.txt` 不在 frontend 写入边界，阶段 3.3 需由 coordinator 或相应角色处理。

## Coordination

- JS → 宿主保留字符串 `drag-window`、`close-window`、`minimize-window`、`panel-open`、`panel-close`；低需求同时发送 `notify:...` 与 `{type:"notify",message}`；存档通过 `{type:"state-save",state}` 回传。
- 宿主 → JS 兼容 `{type:"host-state",event:"restore-state|system-mode|session-lock|session-unlock|battery",paused,reduceMotion,reducedMotion,locked,timeOfDay,greeting,state}`，以及简写 `host-paused/host-resumed/host-locked/host-unlocked`。
- 装备默认关闭，只是前端本地 DOM 装饰；不得将历史背带重新烘焙进基础精灵。完整 rig/网格需新资产后再实现。

## Changed files

- `spine-poc/app.js`: 状态、交互、宿主协议、存档、声音、成长和体验逻辑。
- `spine-poc/index.html`: 右键菜单、存档/声音/装备/成长/小球控件与本地占位说明。
- `spine-poc/app.css`: 控件、污渍/装饰、小球、菜单和暂停状态样式。
- `spine-poc/qa/product-smoke.mjs`, `spine-poc/qa/browser-regression.mjs`: 前端能力、同源资产和运行时回归断言。
- `spine-poc/scripts/sync-android-assets.mjs`: Android Web 资产单一来源同步与校验。
- `android-pet/app/src/main/assets/`: 由同步脚本生成的 Web/Spine/vendor 资产。
- `spine-poc/README.md`, `android-pet/README.md`: 真实能力边界、同步和验证说明。
- `.codex/progress/frontend.md`: 本角色最终 checkpoint。

## Verification evidence

- `D:\Program Files\nodejs\node.exe --check spine-poc\app.js`、同步脚本、三份 QA 脚本、Android 生成 `app.js`：全部 exit 0。
- `D:\Program Files\nodejs\node.exe spine-poc\qa\product-smoke.mjs`：exit 0，产品自检通过。
- `D:\Program Files\nodejs\node.exe spine-poc\qa\browser-regression.mjs`：exit 0；普通浏览器实际约 221 FPS，动画更新目标 60 FPS。
- `$env:JUJU_DESKTOP_MODE='1'; D:\Program Files\nodejs\node.exe spine-poc\qa\browser-regression.mjs`：串行 exit 0；桌面模式实际约 212 FPS，悬停按钮/面板/右键和新状态逻辑通过。
- `D:\Program Files\nodejs\node.exe spine-poc\qa\runtime-visual-check.mjs`：exit 0；idle/waiting/handshake/playing/sleeping/feeding/drinking/cleaning 运行时截图和附件诊断通过。
- `D:\Program Files\nodejs\node.exe spine-poc\scripts\sync-android-assets.mjs`：exit 0，随后 `--check` exit 0，Android Web assets 同源校验通过。
- 曾出现一次同步脚本 `fs.cpSync` Windows 进程错误 `-1073740791`，已改为显式迭代复制并重新运行成功；曾出现一次普通/桌面回归并行占用固定 9229 端口，串行重跑成功。两项均已修复/规避并有最终通过证据。
- 未运行任何 `legacy` 宿主；未执行 git commit/push。

## Recovery note

- Interruption point: 前端实现与验证已完成，等待 coordinator 进行跨角色最终验收。
- First action after recovery: 由 coordinator 审阅 backend checkpoint 和当前 diff，串行执行宿主/Android 构建；frontend 不再修改产品文件。
