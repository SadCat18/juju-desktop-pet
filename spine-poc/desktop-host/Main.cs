using System;
using System.Collections.Generic;
using System.Diagnostics;
using Drawing = System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Interop;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Forms = System.Windows.Forms;
using JsonDictionary = System.Collections.Generic.Dictionary<string, object>;
using JsonSerializer = System.Web.Script.Serialization.JavaScriptSerializer;

internal sealed class App : Application
{
    private static Mutex singleInstanceMutex;

    [STAThread]
    public static void Main()
    {
        bool createdNew;
        singleInstanceMutex = new Mutex(true, "Local\\JiuJiuSpinePet.DesktopHost", out createdNew);
        if (!createdNew) return;

        string contentRoot = FindContentRoot();
        App app = new App();
        // Show explicitly before entering the dispatcher. This keeps the
        // transparent host window visible on systems where Run(Window) does
        // not promote a borderless WebView2 window to a native HWND.
        MainWindow window = new MainWindow(contentRoot);
        window.Show();
        app.Run();
    }

    private static string FindContentRoot()
    {
        string current = AppDomain.CurrentDomain.BaseDirectory;
        for (int i = 0; i < 4; i++)
        {
            if (File.Exists(Path.Combine(current, "index.html"))) return current;
            current = Path.GetFullPath(Path.Combine(current, ".."));
        }

        throw new FileNotFoundException("找不到 Spine POC 的 index.html。请保持桌面宿主位于 spine-poc\\desktop-host 目录。");
    }
}

internal sealed class MainWindow : Window
{
    private const int WmNcLButtonDown = 0x00A1;
    private const int HtCaption = 0x0002;
    private const int PositionSaveDebounceMilliseconds = 250;
    private const int SystemStatePollMilliseconds = 2000;
    private const int MaxStateBytes = 512 * 1024;

    private enum UserNotificationState
    {
        NotPresent = 1,
        Busy = 2,
        RunningD3dFullScreen = 3,
        PresentationMode = 4,
        AcceptsNotifications = 5,
        QuietTime = 6,
        RunningApp = 7,
        BatterySaver = 8,
    }

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr handle);

    [DllImport("shell32.dll")]
    private static extern int SHQueryUserNotificationState(out UserNotificationState state);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);

    private readonly string contentRoot;
    private readonly WebView2CompositionControl webView;
    private readonly LocalServer server;
    private readonly string dataDirectory;
    private readonly string positionFile;
    private readonly string stateFile;
    private readonly JsonSerializer json = new JsonSerializer { MaxJsonLength = MaxStateBytes };
    private readonly DispatcherTimer positionSaveTimer;
    private readonly DispatcherTimer systemStateTimer;
    private Forms.NotifyIcon trayIcon;
    private Drawing.Icon trayIconImage;
    private string restoredStateJson;
    private bool systemBusy;
    private bool sessionLocked;
    private bool initialized;
    private bool closing;

    public MainWindow(string root)
    {
        contentRoot = root;
        server = new LocalServer(contentRoot);
        dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JiuJiuSpinePet");
        positionFile = Path.Combine(dataDirectory, "window-position.txt");
        stateFile = Path.Combine(dataDirectory, "pet-state.json");
        restoredStateJson = LoadState();

        Title = "啾啾桌宠";
        // Keep the transparent hit-test surface close to the pet bounds;
        // the old 440x560 DIPs blocked nearby desktop content unnecessarily.
        Width = 380;
        Height = 420;
        MinWidth = 360;
        MinHeight = 400;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        // A fully transparent layered WPF window can remain visually present
        // while being skipped by Windows hit-testing (WebView2 then becomes
        // click-through). Keep the surface visually transparent but give the
        // layered host a minimal alpha so buttons and drag input have a real
        // hit-test surface.
        Background = new SolidColorBrush(Color.FromArgb(1, 255, 255, 255));
        ResizeMode = ResizeMode.NoResize;
        Topmost = true;
        ShowInTaskbar = false;
        ShowActivated = true;
        Visibility = Visibility.Visible;

        Grid layout = new Grid { Background = new SolidColorBrush(Color.FromArgb(1, 255, 255, 255)) };
        // WebView2 (the HWND-hosted control) can render above a transparent
        // WPF window but is skipped by Windows hit-testing. The composition
        // control keeps the same WebView2 API while participating in the
        // layered window's visual and input tree.
        webView = new WebView2CompositionControl
        {
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Stretch,
            DefaultBackgroundColor = Drawing.Color.Transparent
        };
        layout.Children.Add(webView);
        Content = layout;

        RestorePosition();

        positionSaveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(PositionSaveDebounceMilliseconds) };
        positionSaveTimer.Tick += delegate
        {
            positionSaveTimer.Stop();
            SavePosition();
        };
        systemStateTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(SystemStatePollMilliseconds) };
        systemStateTimer.Tick += delegate { RefreshSystemMode(); };

        SourceInitialized += delegate { ClampToCurrentWorkArea(); };
        Loaded += OnLoaded;
        Closed += OnClosed;
        LocationChanged += OnLocationChanged;
        SystemEvents.SessionSwitch += OnSessionSwitch;
        SetupTrayIcon();
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await server.StartAsync();
            Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "0x00000000", EnvironmentVariableTarget.Process);
            string userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JiuJiuSpinePet", "WebView2");
            Directory.CreateDirectory(userData);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userData, null);
            await webView.EnsureCoreWebView2Async(environment);
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
            webView.Source = new Uri(server.Url + "?host=desktop");
            initialized = true;
            systemStateTimer.Start();
            RefreshSystemMode();
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "啾啾桌宠启动失败", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
    }

    private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess) return;
        if (restoredStateJson != null) SendRestoredState();
        SendSystemModeMessage();
    }

    private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try
        {
            raw = e.WebMessageAsJson;
        }
        catch
        {
            try { raw = json.Serialize(e.TryGetWebMessageAsString()); }
            catch { return; }
        }

        object value;
        try { value = json.DeserializeObject(raw); }
        catch { return; }

        string message = value as string;
        if (message != null)
        {
            HandleCommand(message);
            return;
        }

        IDictionary<string, object> payload = value as IDictionary<string, object>;
        if (payload == null) return;
        string type = ReadString(payload, "type");
        if (type == "notify")
        {
            ShowNotification(ReadString(payload, "message"));
        }
        else if (type == "state-save")
        {
            SaveStateFromMessage(payload);
        }
        else if (type == "host-command")
        {
            HandleCommand(ReadString(payload, "command"));
        }
    }

    private void HandleCommand(string message)
    {
        if (String.IsNullOrWhiteSpace(message)) return;
        if (message.StartsWith("notify:", StringComparison.OrdinalIgnoreCase))
        {
            ShowNotification(message.Substring("notify:".Length));
            return;
        }
        if (message == "drag-window")
        {
            BeginNativeDrag();
        }
        else if (message == "close-window")
        {
            Close();
        }
        else if (message == "minimize-window")
        {
            WindowState = WindowState.Minimized;
        }
        else if (message == "show-window")
        {
            ShowWindow();
        }
    }

    private static string ReadString(IDictionary<string, object> payload, string name)
    {
        object value;
        return payload.TryGetValue(name, out value) ? value as string : null;
    }

    private void ShowNotification(string message)
    {
        if (trayIcon == null || String.IsNullOrWhiteSpace(message)) return;
        string text = message.Trim();
        if (text.Length > 256) text = text.Substring(0, 256);
        trayIcon.ShowBalloonTip(3200, "啾啾", text, Forms.ToolTipIcon.Info);
    }

    private void SaveStateFromMessage(IDictionary<string, object> payload)
    {
        object state;
        if (!payload.TryGetValue("state", out state)) return;
        string stateJson = state as string;
        if (stateJson == null)
        {
            try { stateJson = json.Serialize(state); }
            catch { return; }
        }
        if (!IsSafeStateJson(stateJson)) return;
        try
        {
            AtomicWriteUtf8(stateFile, stateJson);
            restoredStateJson = stateJson;
        }
        catch (Exception error)
        {
            Debug.WriteLine("无法保存啾啾存档：" + error.Message);
        }
    }

    private string LoadState()
    {
        try
        {
            FileInfo file = new FileInfo(stateFile);
            if (!file.Exists || file.Length > MaxStateBytes) return null;
            string candidate = File.ReadAllText(stateFile, new UTF8Encoding(false, true));
            return IsSafeStateJson(candidate) ? candidate : null;
        }
        catch (Exception error)
        {
            Debug.WriteLine("无法读取啾啾存档：" + error.Message);
            return null;
        }
    }

    private bool IsSafeStateJson(string stateJson)
    {
        if (String.IsNullOrWhiteSpace(stateJson) || Encoding.UTF8.GetByteCount(stateJson) > MaxStateBytes) return false;
        try
        {
            object value = json.DeserializeObject(stateJson);
            IDictionary<string, object> root = value as IDictionary<string, object>;
            if (root == null) return false;
            if (!ValidObjectSection(root, "stats") || !ValidObjectSection(root, "inventory") || !ValidObjectSection(root, "settings") || !ValidObjectSection(root, "record")) return false;
            IDictionary<string, object> stats = GetObjectSection(root, "stats");
            if (stats != null && !ValidRange(stats, "hunger", 0, 100) || stats != null && !ValidRange(stats, "thirst", 0, 100) || stats != null && !ValidRange(stats, "energy", 0, 100) || stats != null && !ValidRange(stats, "cleanliness", 0, 100) || stats != null && !ValidRange(stats, "happiness", 0, 100)) return false;
            IDictionary<string, object> inventory = GetObjectSection(root, "inventory");
            if (inventory != null && !ValidRange(inventory, "food", 0, 100000) || inventory != null && !ValidRange(inventory, "water", 0, 100000)) return false;
            return true;
        }
        catch { return false; }
    }

    private static bool ValidObjectSection(IDictionary<string, object> root, string name)
    {
        object section;
        return !root.TryGetValue(name, out section) || section is IDictionary<string, object>;
    }

    private static IDictionary<string, object> GetObjectSection(IDictionary<string, object> root, string name)
    {
        object value;
        return root.TryGetValue(name, out value) ? value as IDictionary<string, object> : null;
    }

    private static bool ValidRange(IDictionary<string, object> values, string name, double minimum, double maximum)
    {
        object value;
        if (!values.TryGetValue(name, out value)) return true;
        double number;
        try { number = Convert.ToDouble(value, CultureInfo.InvariantCulture); }
        catch { return false; }
        return !Double.IsNaN(number) && !Double.IsInfinity(number) && number >= minimum && number <= maximum;
    }

    private void SendRestoredState()
    {
        object state;
        try { state = json.DeserializeObject(restoredStateJson); }
        catch { return; }
        SendHostMessage(new JsonDictionary
        {
            { "type", "host-state" },
            { "event", "restore-state" },
            { "state", state }
        });
    }

    private void SendSystemModeMessage()
    {
        bool paused = systemBusy || sessionLocked;
        SendHostMessage(new JsonDictionary
        {
            { "type", "host-state" },
            { "event", "system-mode" },
            { "paused", paused },
            { "reduceMotion", paused },
            { "reason", sessionLocked ? "locked" : systemBusy ? "fullscreen" : "normal" }
        });
    }

    private void SendHostMessage(JsonDictionary message)
    {
        if (!initialized || webView.CoreWebView2 == null) return;
        try { webView.CoreWebView2.PostWebMessageAsJson(json.Serialize(message)); }
        catch (InvalidOperationException) { }
    }

    private void RefreshSystemMode()
    {
        bool busy = IsSystemBusy();
        if (busy == systemBusy && initialized) return;
        systemBusy = busy;
        Topmost = !systemBusy && !sessionLocked;
        SendSystemModeMessage();
    }

    private static bool IsSystemBusy()
    {
        try
        {
            UserNotificationState state;
            int result = SHQueryUserNotificationState(out state);
            if (result != 0) return false;
            return state == UserNotificationState.Busy
                || state == UserNotificationState.RunningD3dFullScreen
                || state == UserNotificationState.PresentationMode
                || state == UserNotificationState.RunningApp;
        }
        catch (Exception error)
        {
            Debug.WriteLine("无法检测 Windows 通知状态：" + error.Message);
            return false;
        }
    }

    private void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
    {
        if (e.Reason != SessionSwitchReason.SessionLock && e.Reason != SessionSwitchReason.SessionUnlock) return;
        Dispatcher.BeginInvoke(new Action(delegate
        {
            if (closing) return;
            if (e.Reason == SessionSwitchReason.SessionLock)
            {
                sessionLocked = true;
                Topmost = false;
                SendSystemModeMessage();
                SendHostMessage(new JsonDictionary
                {
                    { "type", "host-state" },
                    { "event", "session-lock" },
                    { "animation", "sleeping" },
                    { "paused", true },
                    { "reduceMotion", true }
                });
            }
            else
            {
                sessionLocked = false;
                Topmost = !systemBusy;
                SendSystemModeMessage();
                SendHostMessage(new JsonDictionary
                {
                    { "type", "host-state" },
                    { "event", "session-unlock" },
                    { "greeting", TimeGreeting() },
                    { "paused", systemBusy },
                    { "reduceMotion", systemBusy }
                });
            }
        }));
    }

    private static string TimeGreeting()
    {
        int hour = DateTime.Now.Hour;
        if (hour >= 5 && hour < 11) return "早安，啾啾回来啦";
        if (hour >= 23 || hour < 5) return "晚安，啾啾陪你安静一会儿";
        return "欢迎回来，啾啾一直在等你";
    }

    private void BeginNativeDrag()
    {
        IntPtr handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;
        SetForegroundWindow(handle);
        Activate();
        // DragMove is WPF's native drag path and keeps working when the
        // pointer originated inside WebView2CompositionControl. The old
        // non-client message shortcut could lose the pressed-button state
        // while WebView2 delivered the web message asynchronously.
        try
        {
            DragMove();
            return;
        }
        catch (InvalidOperationException)
        {
            // Fall through to the message path when a synthetic/test input
            // arrives after the native button state has already been released.
        }
        ReleaseCapture();
        SendMessage(handle, WmNcLButtonDown, new IntPtr(HtCaption), IntPtr.Zero);
    }

    private void ShowWindow()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void OnClosed(object sender, EventArgs e)
    {
        closing = true;
        positionSaveTimer.Stop();
        systemStateTimer.Stop();
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        SavePosition();
        if (trayIcon != null)
        {
            trayIcon.Visible = false;
            trayIcon.Dispose();
        }
        if (trayIconImage != null) trayIconImage.Dispose();
        if (webView.CoreWebView2 != null)
        {
            webView.CoreWebView2.WebMessageReceived -= OnWebMessageReceived;
            webView.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
        }
        server.Dispose();
    }

    private void OnLocationChanged(object sender, EventArgs e)
    {
        if (!closing && IsLoaded) positionSaveTimer.Start();
    }

    private void RestorePosition()
    {
        try
        {
            if (!File.Exists(positionFile)) return;
            string[] values = File.ReadAllLines(positionFile);
            double left;
            double top;
            if (values.Length >= 2 && double.TryParse(values[0], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out left) && double.TryParse(values[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out top))
            {
                Left = left;
                Top = top;
                ClampToCurrentWorkArea();
            }
        }
        catch { }
    }

    private void ClampToCurrentWorkArea()
    {
        System.Windows.Rect workArea = CurrentWorkArea();
        Left = Math.Max(workArea.Left, Math.Min(Left, workArea.Right - Width));
        Top = Math.Max(workArea.Top, Math.Min(Top, workArea.Bottom - Height));
    }

    private System.Windows.Rect CurrentWorkArea()
    {
        IntPtr handle = new WindowInteropHelper(this).Handle;
        Drawing.Rectangle pixels = handle == IntPtr.Zero
            ? Forms.Screen.FromPoint(new Drawing.Point((int)Math.Round(Left), (int)Math.Round(Top))).WorkingArea
            : Forms.Screen.FromHandle(handle).WorkingArea;
        return new System.Windows.Rect(pixels.Left, pixels.Top, pixels.Width, pixels.Height);
    }

    private void SavePosition()
    {
        try
        {
            string directory = Path.GetDirectoryName(positionFile);
            string position = String.Join("\n", new[]
            {
                Left.ToString(System.Globalization.CultureInfo.InvariantCulture),
                Top.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });
            AtomicWriteUtf8(positionFile, position);
        }
        catch { }
    }

    private static void AtomicWriteUtf8(string path, string contents)
    {
        string directory = Path.GetDirectoryName(path);
        Directory.CreateDirectory(directory);
        string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            byte[] bytes = new UTF8Encoding(false).GetBytes(contents);
            using (FileStream output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                output.Write(bytes, 0, bytes.Length);
                output.Flush(true);
            }
            if (File.Exists(path)) File.Replace(temporary, path, null);
            else File.Move(temporary, path);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                try { File.Delete(temporary); } catch { }
            }
        }
    }

    private void SetupTrayIcon()
    {
        trayIconImage = LoadPetIcon();
        trayIcon = new Forms.NotifyIcon
        {
            Icon = trayIconImage ?? Drawing.SystemIcons.Application,
            Text = "啾啾桌宠",
            Visible = true
        };
        trayIcon.DoubleClick += delegate { ShowWindow(); };

        Forms.ContextMenuStrip menu = new Forms.ContextMenuStrip();
        menu.Items.Add("显示啾啾", null, delegate { ShowWindow(); });
        menu.Items.Add("退出啾啾", null, delegate { Close(); });
        trayIcon.ContextMenuStrip = menu;
    }

    private Drawing.Icon LoadPetIcon()
    {
        string iconSource = Path.Combine(contentRoot, "spine", "rig-head.png");
        if (!File.Exists(iconSource)) return null;
        try
        {
            using (Drawing.Bitmap bitmap = new Drawing.Bitmap(iconSource))
            {
                IntPtr handle = bitmap.GetHicon();
                try
                {
                    using (Drawing.Icon source = Drawing.Icon.FromHandle(handle))
                    {
                        return new Drawing.Icon(source, new Drawing.Size(16, 16));
                    }
                }
                finally { DestroyIcon(handle); }
            }
        }
        catch (Exception error)
        {
            Debug.WriteLine("无法加载啾啾托盘图标：" + error.Message);
            return null;
        }
    }
}

internal sealed class LocalServer : IDisposable
{
    private readonly string root;
    private readonly HttpListener listener = new HttpListener();
    private readonly CancellationTokenSource cancellation = new CancellationTokenSource();
    private int port;

    public LocalServer(string contentRoot)
    {
        root = Path.GetFullPath(contentRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
    }

    public string Url { get { return "http://127.0.0.1:" + port + "/"; } }

    public Task StartAsync()
    {
        TcpListener probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        listener.Prefixes.Add(Url);
        listener.Start();
        Task.Run((Func<Task>)ServeLoop);
        return Task.FromResult(true);
    }

    private async Task ServeLoop()
    {
        while (!cancellation.IsCancellationRequested)
        {
            HttpListenerContext context;
            try { context = await listener.GetContextAsync(); }
            catch { break; }
            await Serve(context);
        }
    }

    private async Task Serve(HttpListenerContext context)
    {
        try
        {
            string requestPath = Uri.UnescapeDataString(context.Request.Url.AbsolutePath).TrimStart('/');
            if (requestPath.Length == 0) requestPath = "index.html";
            string candidate = Path.GetFullPath(Path.Combine(root, requestPath.Replace('/', Path.DirectorySeparatorChar)));
            if (!candidate.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(candidate))
            {
                context.Response.StatusCode = 404;
                context.Response.Close();
                return;
            }

            context.Response.ContentType = ContentType(Path.GetExtension(candidate));
            context.Response.Headers[HttpResponseHeader.CacheControl] = "no-store";
            using (FileStream input = File.OpenRead(candidate))
            {
                context.Response.ContentLength64 = input.Length;
                await input.CopyToAsync(context.Response.OutputStream);
            }
            context.Response.Close();
        }
        catch
        {
            try { context.Response.StatusCode = 500; context.Response.Close(); } catch { }
        }
    }

    private static string ContentType(string extension)
    {
        switch (extension.ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".atlas": return "text/plain; charset=utf-8";
            case ".png": return "image/png";
            default: return "application/octet-stream";
        }
    }

    public void Dispose()
    {
        cancellation.Cancel();
        if (listener.IsListening) listener.Stop();
        listener.Close();
        cancellation.Dispose();
    }
}
