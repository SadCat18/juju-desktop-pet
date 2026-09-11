import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(qaDir, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "app.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const rig = JSON.parse(fs.readFileSync(path.join(root, "spine", "full-pet.json"), "utf8"));
const actionMesh = JSON.parse(fs.readFileSync(path.join(root, "spine", "action-mesh-30.json"), "utf8"));
const hostSource = fs.readFileSync(path.join(root, "desktop-host", "Main.cs"), "utf8");
const hostLauncher = fs.readFileSync(path.join(root, "desktop-host", "启动啾啾桌宠.cmd"), "utf8");
const packageLauncher = fs.readFileSync(path.join(root, "..", "outputs", "xiaobai-desktop-pet", "启动啾啾桌宠.cmd"), "utf8");

const requiredAnimations = ["idle", "waiting", "petting", "handshake", "feeding", "drinking", "playing", "sleeping", "cleaning"];
const requiredBones = ["root"];
const requiredSlots = ["pet", "real-action", "real-action-next"];
for (const name of requiredAnimations) assert.ok(rig.animations[name], `缺少 Spine 动画: ${name}`);
for (const name of requiredBones) assert.ok(rig.bones.some((bone) => bone.name === name), `缺少整帧骨骼: ${name}`);
for (const name of requiredSlots) assert.ok(rig.slots.some((slot) => slot.name === name), `缺少整帧槽位: ${name}`);
for (const id of ["stage", "panel-toggle", "panel-close", "pet-bubble", "rig-status", "hunger-bar", "thirst-bar", "happiness-bar", "energy-bar", "cleanliness-bar", "auto-toggle", "quality-select", "scale-range", "scale-value"]) {
  assert.ok(html.includes(`id="${id}"`), `页面缺少产品控件: #${id}`);
}
assert.ok(rig.skins?.[0]?.attachments?.["real-action-next"], "缺少照片动作补帧附件");
for (const name of ["feeding", "drinking"]) {
  assert.equal(actionMesh.actions[name]?.sampleCount, 30, `动作网格采样数错误: ${name}`);
  assert.equal(actionMesh.actions[name]?.samples?.length, 30, `动作网格姿态缺失: ${name}`);
}
assert.equal(actionMesh.frameRateTarget, 60, "动作网格目标帧率错误");
for (const token of ["localStorage", "drag-window", "close-window", "minimize-window", "SpineCanvas", "setAnimation", "motionAccumulator", "applyPhotoActionBlend", "applyActionMeshPose", "action-mesh-30.json", "normalizeScale", "updateScaleUI", "petScale", "__jujuDiagnostics"]) {
  assert.ok(app.includes(token), `运行时缺少能力: ${token}`);
}
assert.ok(app.includes("setPanelOpen"), "照顾面板缺少统一开关逻辑");
assert.ok(app.includes('panelClose?.addEventListener("click"'), "照顾面板缺少返回桌宠事件");
assert.ok(app.includes('event.key === "Escape"'), "照顾面板缺少 Esc 返回能力");
assert.ok(css.includes(".desktop-mode .panel-close { display: inline-flex; }"), "桌面照顾面板缺少始终可见返回控件");
assert.ok(hostSource.includes("Width = 380;"), "桌面宿主命中区域宽度仍过大");
assert.ok(hostSource.includes("Height = 420;"), "桌面宿主命中区域高度仍过大");
assert.ok(css.includes(".desktop-mode.pet-hover .window-actions"), "桌面按钮缺少宠物悬停显示规则");
assert.ok(css.includes(".desktop-mode .window-actions { display: flex; opacity: 0;"), "桌面按钮默认未隐藏");
assert.ok(app.includes('canvasElement.addEventListener("pointerenter", showWindowActions)'), "桌面按钮缺少宠物进入事件");
assert.ok(app.includes('canvasElement.addEventListener("pointerleave", hideWindowActionsSoon)'), "桌面按钮缺少宠物离开事件");
assert.ok(app.includes('windowActions?.addEventListener("pointerenter", showWindowActions)'), "桌面按钮缺少按钮区域保留事件");
assert.ok(css.includes(".desktop-mode .stage-wrap { min-height: 390px; border-radius: 22px; background: transparent; }"), "桌面模式仍有舞台光晕");
assert.ok(css.includes(".desktop-mode .stage-wrap::after { display: none; }"), "桌面模式伪元素光晕仍存在");
assert.ok(html.includes('id="interpolation-status"'), "页面缺少补帧状态指示");
assert.ok(hostLauncher.includes("JiuJiuSpinePet.exe"), "正式宿主入口未指向新版 EXE");
assert.ok(packageLauncher.includes("spine-poc\\启动啾啾桌宠.cmd"), "输出包未复用正式启动入口");
assert.ok(fs.existsSync(path.join(root, "desktop-host", "legacy")), "历史宿主未隔离");
assert.equal(fs.existsSync(path.join(root, "desktop-host", "鍟惧暰Spine妗屽疇.exe")), false, "乱码旧宿主仍暴露在启动目录");
assert.equal(fs.existsSync(path.join(root, "..", "outputs", "xiaobai-desktop-pet", "啾啾桌宠.ps1")), false, "旧 PowerShell 宿主仍暴露在输出包");

console.log(`啾啾产品自检通过：${requiredAnimations.length} 个整帧动作、照片动作补帧、状态存档、桌面宿主通信、GPU Spine 入口均存在。`);
