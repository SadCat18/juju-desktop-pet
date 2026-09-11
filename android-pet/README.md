# 啾啾桌宠 Android 版

这是基于现有 Spine WebGL 宠物资源的原生 Android 悬浮窗版本，适配三星近期 One UI 设备的使用方式：

- Android 13+ 请求通知权限，Android 14+ 使用 `specialUse` 前台服务。
- 悬浮窗避开刘海/屏幕边缘，支持横竖屏尺寸变化和拖动。
- WebView 强制使用硬件加速，并关闭系统强制暗色，避免 One UI 夜间模式改变宠物颜色。
- 提供三星后台电池设置入口；如果系统长时间回收后台服务，进入该入口将啾啾设为“不受限制”。

## 使用

1. 安装 APK。
2. 打开“显示在其他应用上层”权限。
3. 点击“开启悬浮桌宠”。
4. 拖动啾啾移动位置，点击右上角 `☰` 打开照顾面板。

## 构建

需要 Android SDK 35、JDK 17 或更高版本。可直接用 Android Studio 打开 `android-pet`，或在已配置 Android SDK 的终端中运行：

```powershell
cd android-pet
.\gradlew.bat assembleDebug
```

生成文件：`app/build/outputs/apk/debug/app-debug.apk`

首次运行如果三星系统提示“允许显示在其他应用上层”，必须允许；这是悬浮桌宠的系统权限，不是应用内可绕过的权限。
