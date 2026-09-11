using System;
using System.Collections.Generic;
using System.Diagnostics;
using Drawing = System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Forms = System.Windows.Forms;

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

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr handle);

    private readonly string contentRoot;
    private readonly WebView2CompositionControl webView;
    private readonly LocalServer server;
    private readonly string positionFile;
    private Forms.NotifyIcon trayIcon;

    public MainWindow(string root)
    {
        contentRoot = root;
        server = new LocalServer(contentRoot);
        positionFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JiuJiuSpinePet", "window-position.txt");

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

        Loaded += OnLoaded;
        Closed += OnClosed;
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
            webView.Source = new Uri(server.Url + "?host=desktop");
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "啾啾桌宠启动失败", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
    }

    private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string message = e.TryGetWebMessageAsString();
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

    private void SetupTrayIcon()
    {
        trayIcon = new Forms.NotifyIcon
        {
            Icon = Drawing.SystemIcons.Application,
            Text = "啾啾桌宠",
            Visible = true
        };
        trayIcon.DoubleClick += delegate { ShowWindow(); };

        Forms.ContextMenuStrip menu = new Forms.ContextMenuStrip();
        menu.Items.Add("显示啾啾", null, delegate { ShowWindow(); });
        menu.Items.Add("退出啾啾", null, delegate { Close(); });
        trayIcon.ContextMenuStrip = menu;
    }

    private void ShowWindow()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void OnClosed(object sender, EventArgs e)
    {
        SavePosition();
        if (trayIcon != null)
        {
            trayIcon.Visible = false;
            trayIcon.Dispose();
        }
        server.Dispose();
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
                System.Windows.Rect workArea = SystemParameters.WorkArea;
                Left = Math.Max(workArea.Left, Math.Min(left, workArea.Right - Width));
                Top = Math.Max(workArea.Top, Math.Min(top, workArea.Bottom - Height));
            }
        }
        catch { }
    }

    private void SavePosition()
    {
        try
        {
            string directory = Path.GetDirectoryName(positionFile);
            Directory.CreateDirectory(directory);
            File.WriteAllLines(positionFile, new[]
            {
                Left.ToString(System.Globalization.CultureInfo.InvariantCulture),
                Top.ToString(System.Globalization.CultureInfo.InvariantCulture)
            });
        }
        catch { }
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
