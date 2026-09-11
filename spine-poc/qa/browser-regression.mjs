import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "juju-browser-"));
const port = 9229;
const desktopMode = process.env.JUJU_DESKTOP_MODE === "1";
const query = new URLSearchParams();
if (desktopMode) query.set("host", "desktop");
if (process.env.JUJU_ACTION_RENDERER) query.set("action-renderer", process.env.JUJU_ACTION_RENDERER);
const pageSuffix = query.toString() ? `?${query}` : "";
const photoFlowFallback = process.env.JUJU_ACTION_RENDERER === "photo-flow";
const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--enable-gpu",
  "--use-gl=angle",
  "--window-size=1280,1000",
  `--remote-debugging-port=${port}`,
  "--remote-allow-origins=*",
  `--user-data-dir=${profile}`,
  `http://127.0.0.1:8765/${pageSuffix}`
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function getPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = pages.find((item) => item.type === "page" && item.url.startsWith("http://127.0.0.1:8765"));
      if (page?.webSocketDebuggerUrl) return page;
    } catch (_error) { /* Chrome is still starting. */ }
    await sleep(100);
  }
  throw new Error("Chrome DevTools 页面未启动");
}

const page = await getPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const resolve = pending.get(message.id);
  if (!resolve) return;
  pending.delete(message.id);
  if (message.error) resolve(Promise.reject(new Error(message.error.message)));
  else resolve(message.result);
});

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (value) => {
      if (value?.then) value.then(resolve, reject);
      else resolve(value);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  return result.result?.value;
}

await call("Page.enable");
await call("Runtime.enable");
for (let attempt = 0; attempt < 40; attempt += 1) {
  if ((await evaluate("document.querySelector('#spine-status')?.textContent")) === "Spine 已连接") break;
  await sleep(100);
}
assert.equal(await evaluate("document.querySelector('#spine-status')?.textContent"), "Spine 已连接");
assert.equal(await evaluate("document.querySelector('#gpu-status')?.textContent"), "WebGL GPU 已启用");
const diagnostics = await evaluate("window.__jujuDiagnostics");
assert.equal(diagnostics?.spineInterpolation, true, "Spine 时间线补帧未启用");
assert.equal(diagnostics?.photoFrameBlend, true, "照片动作平滑过渡未启用");
assert.equal(diagnostics?.actionMeshLoaded, true, "Spine 30 点动作资产未加载");
assert.equal(diagnostics?.actionMeshActive, !photoFlowFallback, "Spine 30 点动作模式启用状态错误");
assert.equal(diagnostics?.actionMeshSampleCount, 30, "动作网格采样数错误");
assert.ok([60, 180, 300].includes(diagnostics?.targetMotionHz), "动作目标频率无效");
assert.equal(diagnostics?.petScale, 100, "桌宠默认大小错误");
await evaluate("(() => { const input = document.querySelector('#scale-range'); input.value = '125'; input.dispatchEvent(new Event('input', { bubbles: true })); })()");
assert.equal(await evaluate("window.__jujuDiagnostics.petScale"), 125, "桌宠大小未实时更新");

if (desktopMode) {
  assert.equal(await evaluate("document.body.classList.contains('desktop-mode')"), true, "桌面模式未启用");
  await evaluate("document.querySelector('#stage').dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))");
  await sleep(220);
  assert.equal(await evaluate("document.body.classList.contains('pet-hover')"), true, "进入宠物后右上角按钮未显示");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.window-actions')).opacity"), "1", "宠物悬停后按钮仍透明");
  const desktopStage = await evaluate("(() => { const r = document.querySelector('#stage-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()");
  const desktopHoverScreenshot = await call("Page.captureScreenshot", { format: "png", clip: desktopStage });
  fs.writeFileSync(path.join(root, "qa", "desktop-hover-buttons-browser.png"), Buffer.from(desktopHoverScreenshot.data, "base64"));
  await evaluate("document.querySelector('#stage').dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))");
  await sleep(500);
  assert.equal(await evaluate("document.body.classList.contains('pet-hover')"), false, "离开宠物后右上角按钮未隐藏");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.window-actions')).opacity"), "0", "离开宠物后按钮仍可见");
  const desktopAwayScreenshot = await call("Page.captureScreenshot", { format: "png", clip: desktopStage });
  fs.writeFileSync(path.join(root, "qa", "desktop-away-buttons-browser.png"), Buffer.from(desktopAwayScreenshot.data, "base64"));
  await evaluate("document.querySelector('.window-actions').dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))");
  assert.equal(await evaluate("document.body.classList.contains('pet-hover')"), true, "进入按钮区域时未保留显示");
  await evaluate("document.querySelector('.window-actions').dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))");
  await sleep(500);
  assert.equal(await evaluate("document.body.classList.contains('pet-hover')"), false, "离开按钮区域后未隐藏");

  await evaluate("document.querySelector('#panel-toggle').click()");
  assert.equal(await evaluate("document.body.classList.contains('panel-open')"), true, "照顾面板未打开");
  assert.ok(["flex", "inline-flex"].includes(await evaluate("getComputedStyle(document.querySelector('#panel-close')).display")), "返回桌宠按钮未显示");
  await sleep(260);
  const panelRect = await evaluate("(() => { const r = document.querySelector('.control-card').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()");
  const panelScreenshot = await call("Page.captureScreenshot", { format: "png", clip: panelRect });
  fs.writeFileSync(path.join(root, "qa", "desktop-panel-return-browser.png"), Buffer.from(panelScreenshot.data, "base64"));
  await evaluate("document.querySelector('#panel-close').click()");
  assert.equal(await evaluate("document.body.classList.contains('panel-open')"), false, "点击返回桌宠后面板仍打开");
  assert.equal(await evaluate("document.querySelector('#panel-toggle').getAttribute('aria-expanded')"), "false", "返回桌宠后面板状态未同步");

  await evaluate("document.querySelector('#panel-toggle').click()");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  assert.equal(await evaluate("document.body.classList.contains('panel-open')"), false, "Esc 未关闭照顾面板");
}

const actions = [
  ["idle", "idle · 呼吸中"],
  ["waiting", "waiting · 期待你的回应"],
  ["petting", "petting · 摸摸头"],
  ["handshake", "handshake · 和你握手"],
  ["feeding", "feeding · 认真吃饭"],
  ["drinking", "drinking · 咕咚喝水"],
  ["playing", "playing · 和小球玩耍"],
  ["sleeping", "sleeping · 做个好梦"],
  ["cleaning", "cleaning · 整理毛发"]
];
for (const [action, label] of actions) {
  await evaluate(`document.querySelector('[data-action="${action}"]').click()`);
  await sleep(180);
  assert.equal(await evaluate("document.querySelector('#motion-status')?.textContent"), label, `动作未切换: ${action}`);
}

const foodBefore = await evaluate("JSON.parse(localStorage.getItem('juju-pet-state-v2')).inventory.food");
await evaluate("document.querySelector('[data-action=feeding]').click()");
assert.equal(await evaluate("document.querySelector('#pet-bubble')?.classList.contains('visible')"), true, "喂食开始时应出现啾啾反馈气泡");
assert.equal(await evaluate("JSON.parse(localStorage.getItem('juju-pet-state-v2')).inventory.food"), foodBefore, "喂食开始时不应提前扣库存");
await sleep(2450);
assert.equal(await evaluate("JSON.parse(localStorage.getItem('juju-pet-state-v2')).inventory.food"), foodBefore - 1, "喂食完成后应扣除一份库存");
await sleep(260);
const stageRect = await evaluate("(() => { const r = document.querySelector('#stage-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()");
const screenshot = await call("Page.captureScreenshot", { format: "png", clip: stageRect });
fs.writeFileSync(path.join(root, "qa", "layered-feeding.png"), Buffer.from(screenshot.data, "base64"));

const state = await evaluate("JSON.parse(localStorage.getItem('juju-pet-state-v2'))");
assert.ok(state?.inventory && Number.isFinite(state.inventory.food), "库存存档缺失");
assert.ok(state?.settings?.quality === 180 || state?.settings?.quality === 300 || state?.settings?.quality === 60, "刷新率存档缺失");
assert.equal(state?.settings?.scale, 125, "桌宠大小未保存");
const finalDiagnostics = await evaluate("window.__jujuDiagnostics");
assert.ok(finalDiagnostics.simulationFrames > 60, "动作时间步进未持续运行");
assert.ok(finalDiagnostics.actualFps >= 0, "实际 FPS 统计缺失");
console.log(`浏览器回归通过：Spine/GPU 已连接、${actions.length} 个动作可切换、分层喂食画面已截图、存档可读；实际 ${finalDiagnostics.actualFps} FPS，目标动作步进 ${finalDiagnostics.targetMotionHz}Hz。`);

socket.close();
chrome.kill();
