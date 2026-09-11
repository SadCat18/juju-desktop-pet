package com.jiujiu.pet;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;

public final class MainActivity extends Activity {
    private TextView status;
    private Button primary;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setTitle(getString(R.string.app_name));
        requestNotificationPermission();
        buildScreen();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshScreen();
    }

    private void buildScreen() {
        int page = dp(24);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(page, dp(34), page, page);
        content.setBackgroundColor(Color.rgb(255, 249, 243));
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars());
                view.setPadding(page, dp(24) + bars.top, page, page + bars.bottom);
            }
            return insets;
        });

        TextView mark = text("啾", 30, Color.rgb(32, 88, 76));
        GradientDrawable markBackground = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(212, 244, 233), Color.rgb(147, 220, 200)});
        markBackground.setCornerRadius(dp(18));
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(markBackground);
        content.addView(mark, new LinearLayout.LayoutParams(dp(64), dp(64)));

        TextView title = text("啾啾桌宠", 30, Color.rgb(65, 58, 56));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
        titleParams.topMargin = dp(22);
        content.addView(title, titleParams);

        TextView description = text(
                "把啾啾放到手机屏幕上，随时摸摸头、喂饭饭、喝水水和玩球球。\n\n首次使用需要允许“显示在其他应用上层”，这是 Android 悬浮桌宠的必要权限。",
                16, Color.rgb(117, 106, 99));
        description.setLineSpacing(0, 1.15f);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(-1, -2);
        descriptionParams.topMargin = dp(12);
        content.addView(description, descriptionParams);

        status = text("正在检查权限…", 14, Color.rgb(62, 170, 144));
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
        statusParams.topMargin = dp(28);
        content.addView(status, statusParams);

        primary = new Button(this);
        primary.setAllCaps(false);
        primary.setTextSize(16);
        LinearLayout.LayoutParams primaryParams = new LinearLayout.LayoutParams(-1, dp(52));
        primaryParams.topMargin = dp(14);
        content.addView(primary, primaryParams);

        Button stop = new Button(this);
        stop.setAllCaps(false);
        stop.setTextSize(15);
        stop.setText("关闭悬浮桌宠");
        stop.setOnClickListener(view -> {
            stopService(new Intent(this, PetOverlayService.class));
            refreshScreen();
        });
        LinearLayout.LayoutParams stopParams = new LinearLayout.LayoutParams(-1, dp(50));
        stopParams.topMargin = dp(8);
        content.addView(stop, stopParams);

        Button battery = new Button(this);
        battery.setAllCaps(false);
        battery.setTextSize(14);
        battery.setText("三星后台运行设置");
        battery.setOnClickListener(view -> openBatterySettings());
        LinearLayout.LayoutParams batteryParams = new LinearLayout.LayoutParams(-1, dp(48));
        batteryParams.topMargin = dp(8);
        content.addView(battery, batteryParams);

        Space spacer = new Space(this);
        content.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1));

        TextView tip = text("啾啾会保留状态和库存；点击悬浮窗右上角 ☰ 打开照顾面板。", 13, Color.rgb(141, 130, 121));
        tip.setGravity(Gravity.CENTER_HORIZONTAL);
        content.addView(tip, new LinearLayout.LayoutParams(-1, -2));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(content);
        setContentView(scroll);
    }

    private void refreshScreen() {
        if (status == null) return;
        if (!Settings.canDrawOverlays(this)) {
            status.setText("需要悬浮窗权限");
            primary.setText("去开启悬浮窗权限");
            primary.setOnClickListener(view -> {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            });
            return;
        }

        status.setText("权限已开启，可以启动啾啾");
        primary.setText("开启悬浮桌宠");
        primary.setOnClickListener(view -> {
            Intent intent = new Intent(this, PetOverlayService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
            status.setText("啾啾已出现在屏幕上");
        });
    }

    private TextView text(String value, float size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 42);
        }
    }

    private void openBatterySettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (RuntimeException ignored) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }
}
