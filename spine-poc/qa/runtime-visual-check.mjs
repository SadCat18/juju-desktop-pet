import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "juju-visual-"));
const port = 9231;
const chrome = spawn(process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--enable-gpu", "--use-gl=angle",
  "--window-size=1280,1000", `--remote-debugging-port=${port}`, "--remote-allow-origins=*",
  `--user-data-dir=${profile}`, "http://127.0.0.1:8765/",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let page;
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    page = pages.find((item) => item.type === "page" && item.url.startsWith("http://127.0.0.1:8765"));
    if (page?.webSocketDebuggerUrl) break;
  } catch (_error) { /* Chrome is starting. */ }
  await sleep(100);
}
assert.ok(page?.webSocketDebuggerUrl, "Chrome 页面未启动");

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
  resolve(message.error ? Promise.reject(new Error(message.error.message)) : message.result);
});
function call(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, (value) => value?.then ? value.then(resolve) : resolve(value));
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
  return result.result?.value;
}

for (let attempt = 0; attempt < 50; attempt += 1) {
  if (await evaluate("document.querySelector('#spine-status')?.textContent") === "Spine 已连接") break;
  await sleep(100);
}
const spineStatus = await evaluate("document.querySelector('#spine-status')?.textContent");
if (spineStatus !== "Spine 已连接") {
  console.error(await evaluate("document.querySelector('#error')?.textContent"));
}
assert.equal(spineStatus, "Spine 已连接");
await evaluate("document.querySelector('#panel-toggle').click()");
assert.equal(await evaluate("document.body.classList.contains('panel-open')"), true, "照顾面板未打开");

for (const action of ["idle", "waiting", "handshake", "playing", "sleeping", "feeding", "drinking", "cleaning"]) {
  await evaluate(`document.querySelector('[data-action="${action}"]').click()`);
  await sleep(action === "feeding" || action === "drinking" ? 1100 : 450);
  const diagnostics = await evaluate("window.__jujuDiagnostics");
  const stage = await evaluate("(() => { const r = document.querySelector('#stage-wrap').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}; })()");
  const screenshot = await call("Page.captureScreenshot", { format: "png", clip: stage });
  fs.writeFileSync(path.join(root, "qa", `runtime-${action}.png`), Buffer.from(screenshot.data, "base64"));
  console.log(action, JSON.stringify({ currentAnimation: diagnostics.currentAnimation, attachments: diagnostics.attachments }));
}

socket.close();
chrome.kill();
