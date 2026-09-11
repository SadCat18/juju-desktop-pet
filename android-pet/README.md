# 啾啾桌宠 Android 版

这是基于 `spine-poc` Web 资产的 Android 悬浮窗版本。原生层负责悬浮窗、权限和生命周期；页面层（状态、动作、照顾面板）与 Web 原型共用同一份文件。

## 使用

1. 安装 APK，并允许“显示在其他应用上层”。
2. 点击“开启悬浮桌宠”。
3. 拖动啾啾移动位置，点击右上角 `☰` 打开照顾面板。
4. 面板可用“返回桌宠”或 Android 返回/Esc 路径收起；导出/导入存档由页面本地 JSON 控件完成。

Android 页面不会依赖鼠标悬停；`mobile=1` 样式会保持窗口控制和面板关闭入口可用。对话模型和跨设备云同步没有接入，页面中的对应能力只是安全的离线占位。

## Web 资产同步

不要直接编辑 `app/src/main/assets/` 内的 Web 副本。修改 `spine-poc/app.js`、`index.html`、`app.css` 或 `spine/` 后，在仓库根目录运行：

```powershell
& 'D:\Program Files\nodejs\node.exe' .\spine-poc\scripts\sync-android-assets.mjs
& 'D:\Program Files\nodejs\node.exe' .\spine-poc\scripts\sync-android-assets.mjs --check
```

脚本会重建 `app/src/main/assets/` 的 Web 页面、Spine 资产和 Spine runtime；`--check` 只比较文件，不修改 Android 工程。这样 Android 与 Web 原型的 Esc、返回桌宠、状态闭环和面板逻辑不会再手工分叉。

## 构建

需要 Android SDK 35、JDK 17 或更高版本。可直接用 Android Studio 打开 `android-pet`，或在已配置 Android SDK 的终端中运行：

```powershell
cd android-pet
.\gradlew.bat assembleDebug
```

生成文件：`app/build/outputs/apk/debug/app-debug.apk`。
