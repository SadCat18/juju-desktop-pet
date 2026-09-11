package com.jiujiu.pet;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.BatteryManager;
import android.os.Handler;
import android.os.IBinder;
import android.provider.Settings;
import android.net.Uri;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.content.pm.ServiceInfo;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONException;
import org.json.JSONObject;

public final class PetOverlayService extends Service {
    private static final String CHANNEL_ID = "juju-pet";
    private final Handler mainHandler = new Handler();
    private WindowManager windowManager;
    private WebView webView;
    private WindowManager.LayoutParams windowParams;
    private int screenWidth;
    private int screenHeight;
    private int compactWidth;
    private int compactHeight;
    private int compactX;
    private int compactY;
    private boolean panelOpen;
    private boolean moving;
    private float downRawX;
    private float downRawY;
    private int downWindowX;
    private int downWindowY;
    private BroadcastReceiver batteryReceiver;
    private boolean batteryStateKnown;
    private boolean lastCharging;
    private boolean lastLowBattery;
    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1001, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1001, buildNotification(), 0);
        } else {
            startForeground(1001, buildNotification());
        }
        if (!Settings.canDrawOverlays(this)) {
            stopSelf();
            return;
        }
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createOverlay();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (webView == null && windowManager != null) createOverlay();
        return START_STICKY;
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        updateDisplayBounds();
        if (windowParams == null || webView == null) return;
        if (panelOpen) {
            windowParams.width = Math.min(dp(420), screenWidth - dp(16));
            windowParams.height = Math.max(dp(560), screenHeight - dp(24));
        } else {
            compactWidth = Math.min(dp(390), screenWidth - dp(16));
            compactHeight = dp(430);
            windowParams.width = compactWidth;
            windowParams.height = compactHeight;
        }
        windowParams.x = clamp(windowParams.x, dp(8), screenWidth - windowParams.width - dp(8));
        windowParams.y = clamp(windowParams.y, dp(8), screenHeight - windowParams.height - dp(8));
        try {
            windowManager.updateViewLayout(webView, windowParams);
        } catch (RuntimeException ignored) {
            stopSelf();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        unregisterBatteryReceiver();
        mainHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            try {
                windowManager.removeView(webView);
            } catch (RuntimeException ignored) {
                // The system may already have removed the overlay window.
            }
            webView.destroy();
            webView = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        super.onDestroy();
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface", "ClickableViewAccessibility"})
    private void createOverlay() {
        if (webView != null) return;
        updateDisplayBounds();
        compactWidth = Math.min(dp(390), screenWidth - dp(16));
        compactHeight = dp(430);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            settings.setAlgorithmicDarkeningAllowed(false);
        }
        settings.setAllowUniversalAccessFromFileURLs(false);
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader.shouldInterceptRequest(Uri.parse(url));
            }
        });
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.setOnTouchListener(this::handleTouch);

        windowParams = new WindowManager.LayoutParams(
                compactWidth,
                compactHeight,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        windowParams.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            windowParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER;
        }
        compactX = clamp(screenWidth - compactWidth - dp(16), dp(8), screenWidth - compactWidth - dp(8));
        compactY = clamp(screenHeight - compactHeight - dp(96), dp(8), screenHeight - compactHeight - dp(8));
        windowParams.x = compactX;
        windowParams.y = compactY;
        windowManager.addView(webView, windowParams);
        registerBatteryReceiver();
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html?host=desktop&mobile=1");
    }

    private void registerBatteryReceiver() {
        batteryReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                updateBatteryState(intent);
            }
        };
        IntentFilter filter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(batteryReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(batteryReceiver, filter);
            }
        } catch (RuntimeException ignored) {
            // Battery greetings are optional; a restricted device still gets the overlay.
            batteryReceiver = null;
        }
    }

    private void unregisterBatteryReceiver() {
        if (batteryReceiver == null) return;
        try {
            unregisterReceiver(batteryReceiver);
        } catch (RuntimeException ignored) {
            // Registration may have failed or the process may already be stopping.
        }
        batteryReceiver = null;
    }

    private void updateBatteryState(Intent intent) {
        int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) return;
        int percent = Math.max(0, Math.min(100, Math.round(level * 100f / scale)));
        int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL;
        boolean lowBattery = percent <= 20 && !charging;
        if (!batteryStateKnown) {
            batteryStateKnown = true;
            lastCharging = charging;
            lastLowBattery = lowBattery;
            return;
        }
        String greeting = null;
        if (charging && !lastCharging) {
            greeting = "充上电啦，啾啾安心陪着你";
        } else if (lowBattery && !lastLowBattery) {
            greeting = "手机电量有点低，记得给手机充电哦";
        }
        lastCharging = charging;
        lastLowBattery = lowBattery;
        if (greeting != null) sendBatteryMessage(percent, charging, greeting);
    }

    private void sendBatteryMessage(int level, boolean charging, String greeting) {
        if (webView == null) return;
        try {
            JSONObject message = new JSONObject();
            message.put("type", "host-state");
            message.put("event", "battery");
            message.put("level", level);
            message.put("charging", charging);
            message.put("greeting", greeting);
            String script = "window.postMessage(" + message + ", '*')";
            webView.post(() -> {
                if (webView != null) webView.evaluateJavascript(script, null);
            });
        } catch (JSONException ignored) {
            // Battery greetings are optional; a malformed message must not stop the pet.
        }
    }

    private boolean handleTouch(View view, MotionEvent event) {
        if (panelOpen || windowParams == null) return false;
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                moving = false;
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                downWindowX = windowParams.x;
                downWindowY = windowParams.y;
                break;
            case MotionEvent.ACTION_MOVE:
                float dx = event.getRawX() - downRawX;
                float dy = event.getRawY() - downRawY;
                if (!moving && Math.hypot(dx, dy) > ViewConfiguration.get(this).getScaledTouchSlop()) {
                    moving = true;
                }
                if (moving) {
                    windowParams.x = clamp(downWindowX + Math.round(dx), dp(8), screenWidth - windowParams.width - dp(8));
                    windowParams.y = clamp(downWindowY + Math.round(dy), dp(8), screenHeight - windowParams.height - dp(8));
                    try {
                        windowManager.updateViewLayout(webView, windowParams);
                    } catch (RuntimeException ignored) {
                        // The overlay can disappear while Android is revoking permission.
                    }
                }
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (moving) {
                    compactX = windowParams.x;
                    compactY = windowParams.y;
                }
                moving = false;
                break;
            default:
                break;
        }
        return false;
    }

    private void resizeOverlay(boolean open) {
        if (windowParams == null || webView == null || panelOpen == open) return;
        panelOpen = open;
        if (open) {
            compactX = windowParams.x;
            compactY = windowParams.y;
            windowParams.width = Math.min(dp(420), screenWidth - dp(16));
            windowParams.height = Math.max(dp(560), screenHeight - dp(24));
            windowParams.x = clamp(compactX, dp(8), screenWidth - windowParams.width - dp(8));
            windowParams.y = clamp(compactY, dp(8), screenHeight - windowParams.height - dp(8));
        } else {
            windowParams.width = compactWidth;
            windowParams.height = compactHeight;
            windowParams.x = clamp(compactX, dp(8), screenWidth - compactWidth - dp(8));
            windowParams.y = clamp(compactY, dp(8), screenHeight - compactHeight - dp(8));
        }
        try {
            windowManager.updateViewLayout(webView, windowParams);
        } catch (RuntimeException ignored) {
            stopSelf();
        }
    }

    private void handleHostMessage(String message) {
        if ("panel-open".equals(message)) {
            resizeOverlay(true);
        } else if ("panel-close".equals(message)) {
            resizeOverlay(false);
        } else if ("close-window".equals(message) || "minimize-window".equals(message)) {
            stopSelf();
        }
    }

    private Notification buildNotification() {
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_pet)
                .setContentTitle("啾啾桌宠正在运行")
                .setContentText("点击返回啾啾设置")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setShowWhen(false)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("悬浮桌宠的运行状态");
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void updateDisplayBounds() {
        screenWidth = getResources().getDisplayMetrics().widthPixels;
        screenHeight = getResources().getDisplayMetrics().heightPixels;
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(value, Math.max(min, max)));
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void postMessage(String message) {
            mainHandler.post(() -> handleHostMessage(message));
        }
    }
}
