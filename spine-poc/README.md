# 啾啾 Spine 2D + GPU 桌宠

这是啾啾的 Web 产品切片，也是 Windows 宿主和 Android 悬浮窗共用的 Web 资产源。

## 启动

- 桌面宠物版：双击 `启动啾啾桌宠.cmd`。正式入口会启动当前 WPF + WebView2 宿主。
- 浏览器体验版：双击 `启动Spine原型.cmd`，或在本目录运行 `node .\server.mjs --open`，访问 `http://127.0.0.1:8765/`。
- 不要直接打开 `desktop-host\legacy` 中的历史宿主或其它旧 EXE。

## 当前能力

- 使用 Spine runtime 4.2.120 和 WebGL 渲染现有 `full-pet.json` / `full-pet.atlas`。
- 当前骨架实际只有一个 `root` 骨骼和整帧 `pet` 槽；喂食、喝水使用现有照片帧在 `real-action` / `real-action-next` 两槽间短时平滑过渡。
- `action-mesh-30.json` 与 `rig-*.png` 是后续真实分层 rig/网格制作的输入资料；由于当前 JSON 没有对应骨骼/槽位，运行时不会加载或伪称动作网格已激活。
- 饱腹、水分、精力、整洁、心情、库存、成长和成就保存在 `localStorage`（`juju-pet-state-v2`）。库存每天按本地日期补给食物/饮水各 5 份，上限各 10 份；状态前台每 60 秒按 `lastUpdated` 连续衰减，离线恢复各维最低 15。
- 饥饿或口渴低于 25 时，页面显示气泡并切换等待动作；若存在宿主，会发送 `notify:...`。动作完成后会明确显示本次消耗和剩余库存。
- 支持单击摸头、快速双击跳跳、移动拖动；画布右键打开 HTML 快捷菜单。桌面模式有小球拖掷、空闲漫步、清洁可见灰尘和可关闭的本地小花领巾装饰。
- 面板提供声音/静音/音量、动画更新 30/60/90 FPS、大小、导出/导入 JSON、成长成就和本地回应占位。对话模型、云端跨设备同步没有接入，不会伪称已连接或上传数据。
- 页面接收 `host-state` JSON（`paused`、`reducedMotion`、`locked`、`timeOfDay`）以及 `state-restore` 消息；未知宿主消息会被忽略。暂停/锁屏时页面停止动画推进并在夜间进入睡觉状态。

## Android Web 资产同步

Android 不再手工维护 Web 双份。修改本目录的 `app.js`、`index.html`、`app.css` 或 `spine/` 后，从仓库根目录运行：

```powershell
& 'D:\Program Files\nodejs\node.exe' .\spine-poc\scripts\sync-android-assets.mjs
& 'D:\Program Files\nodejs\node.exe' .\spine-poc\scripts\sync-android-assets.mjs --check
```

脚本会重建 `android-pet/app/src/main/assets/` 中的 Web 文件、Spine 资源和 runtime；`--check` 只校验、不写入。Android 仍使用移动参数，因此面板的 Esc 和“返回桌宠”路径会保留。

## 自检

在仓库根目录运行：

```powershell
& 'D:\Program Files\nodejs\node.exe' --check .\spine-poc\app.js
& 'D:\Program Files\nodejs\node.exe' .\spine-poc\qa\product-smoke.mjs
& 'D:\Program Files\nodejs\node.exe' .\spine-poc\qa\browser-regression.mjs
& 'D:\Program Files\nodejs\node.exe' .\spine-poc\qa\runtime-visual-check.mjs
```
