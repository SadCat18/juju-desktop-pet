/* global spine */

const canvasElement = document.querySelector("#stage");
const loadingElement = document.querySelector("#loading");
const errorElement = document.querySelector("#error");
const toastElement = document.querySelector("#toast");
const petBubbleElement = document.querySelector("#pet-bubble");
const spineStatus = document.querySelector("#spine-status");
const gpuStatus = document.querySelector("#gpu-status");
const rigStatus = document.querySelector("#rig-status");
const fpsStatus = document.querySelector("#fps-status");
const interpolationStatus = document.querySelector("#interpolation-status");
const motionStatus = document.querySelector("#motion-status");
const dragStatus = document.querySelector("#drag-status");
const debugToggle = document.querySelector("#debug-toggle");
const qualitySelect = document.querySelector("#quality-select");
const scaleRange = document.querySelector("#scale-range");
const scaleValue = document.querySelector("#scale-value");
const autoToggle = document.querySelector("#auto-toggle");
const autoInterval = document.querySelector("#auto-interval");
const panelToggle = document.querySelector("#panel-toggle");
const panelClose = document.querySelector("#panel-close");
const windowActions = document.querySelector(".window-actions");
const desktopMode = new URLSearchParams(window.location.search).get("host") === "desktop";
const mobileMode = new URLSearchParams(window.location.search).get("mobile") === "1";
const actionRenderer = new URLSearchParams(window.location.search).get("action-renderer") || "spine-30";
// Keep the whole registered cell intact. Independently rotating cropped
// regions was the source of detached paws, ears, and facial features.
const fullPoseMode = true;
const storageKey = "juju-pet-state-v2";

if (desktopMode) document.body.classList.add("desktop-mode");
if (mobileMode) document.body.classList.add("mobile-mode");

const animationLabels = {
  idle: "idle · 呼吸中",
  handshake: "handshake · 和你握手",
  feeding: "feeding · 认真吃饭",
  drinking: "drinking · 咕咚喝水",
  playing: "playing · 和小球玩耍",
  sleeping: "sleeping · 做个好梦",
  cleaning: "cleaning · 整理毛发",
  waiting: "waiting · 期待你的回应",
  petting: "petting · 摸摸头",
  rest: "rest · 安静休息中",
};

const defaultState = {
  stats: { hunger: 82, thirst: 76, energy: 68, cleanliness: 88, happiness: 74 },
  inventory: { food: 6, water: 8 },
  settings: { autoBehavior: true, autoInterval: 30, quality: 180, scale: 100 },
  record: { date: "", count: 0, lastAction: "" },
  lastUpdated: Date.now(),
};

let state = readState();
let spineCanvas = null;
let skeleton = null;
let animationState = null;
let currentAnimation = "idle";
let drag = null;
let targetPosition = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };
let quality = normalizeQuality(state.settings.quality);
let petScale = normalizeScale(state.settings.scale);
let autoTimer = null;
let toastTimer = null;
let petBubbleTimer = null;
let actionRun = null;
let actionCommitTimer = null;
let actionMesh = null;
let motionAccumulator = 0;
let measuredFrames = 0;
let measuredElapsed = 0;
let actualFps = 0;
let simulationFrames = 0;
let windowActionsHideTimer = null;

const photoActionTimelines = {
  feeding: { prefix: "feeding-real", times: [0.12, 0.85, 1.58, 2.31, 3.04, 3.77], end: 4.85 },
  drinking: { prefix: "drinking-real", times: [0.12, 0.85, 1.58, 2.31, 3.04, 3.77], end: 4.85 },
};

window.__jujuDiagnostics = {
  actualFps: 0,
  targetMotionHz: quality,
  simulationFrames: 0,
  spineInterpolation: true,
  photoFrameBlend: true,
  photoActionRenderer: actionRenderer,
  actionMeshInterpolation: true,
  actionMeshLoaded: false,
  actionMeshActive: actionRenderer !== "photo-flow",
  actionMeshSampleCount: 0,
  fullPoseRendering: fullPoseMode,
  lastDelta: 0,
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeQuality(value) {
  const candidate = Number(value);
  return [60, 180, 300].includes(candidate) ? candidate : 180;
}

function normalizeScale(value) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return 100;
  return Math.max(70, Math.min(130, Math.round(candidate / 5) * 5));
}

function updateQualityUI() {
  quality = normalizeQuality(quality);
  qualitySelect.value = String(quality);
  const note = document.querySelector("#quality-note");
  if (note) note.textContent = `目标 ${quality}Hz · Spine 连续补帧 · 实际刷新受显示器与系统合成器限制`;
  if (interpolationStatus) interpolationStatus.textContent = "Spine 补帧开启";
  window.__jujuDiagnostics.targetMotionHz = quality;
}

function updateScaleUI() {
  petScale = normalizeScale(petScale);
  if (scaleRange) scaleRange.value = String(petScale);
  if (scaleValue) scaleValue.textContent = `${petScale}%`;
  window.__jujuDiagnostics.petScale = petScale;
  if (!skeleton) return;
  const multiplier = petScale / 100;
  skeleton.scaleX = 1.36 * multiplier;
  skeleton.scaleY = 1.36 * multiplier;
  skeleton.updateWorldTransform(spine.Physics.update);
}

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    return {
      ...defaultState,
      ...saved,
      stats: { ...defaultState.stats, ...(saved?.stats || {}) },
      inventory: { ...defaultState.inventory, ...(saved?.inventory || {}) },
      settings: { ...defaultState.settings, ...(saved?.settings || {}) },
      record: { ...defaultState.record, ...(saved?.record || {}) },
    };
  } catch (_error) {
    return { ...defaultState, stats: { ...defaultState.stats }, inventory: { ...defaultState.inventory }, settings: { ...defaultState.settings }, record: { ...defaultState.record } };
  }
}

function saveState() {
  state.lastUpdated = Date.now();
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_error) { /* localStorage can be disabled in private contexts */ }
}

function applyElapsedDecay() {
  const elapsedMinutes = Math.max(0, (Date.now() - Number(state.lastUpdated || Date.now())) / 60000);
  if (elapsedMinutes < 1) return;
  state.stats.hunger = clamp(state.stats.hunger - elapsedMinutes * 0.75);
  state.stats.thirst = clamp(state.stats.thirst - elapsedMinutes * 1.05);
  state.stats.energy = clamp(state.stats.energy - elapsedMinutes * 0.25);
  state.stats.cleanliness = clamp(state.stats.cleanliness - elapsedMinutes * 0.35);
  state.stats.happiness = clamp(state.stats.happiness - elapsedMinutes * 0.2);
  state.lastUpdated = Date.now();
  saveState();
}

function setPill(element, text, status) {
  element.textContent = text;
  element.className = `pill ${status}`;
}

function setError(message) {
  loadingElement.hidden = true;
  errorElement.hidden = false;
  errorElement.textContent = message;
  setPill(spineStatus, "Spine 加载失败", "bad");
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove("visible"), 2200);
}

function showPetBubble(message, duration = 2400) {
  if (!petBubbleElement) return;
  petBubbleElement.textContent = message;
  petBubbleElement.classList.add("visible");
  clearTimeout(petBubbleTimer);
  petBubbleTimer = setTimeout(() => petBubbleElement.classList.remove("visible"), duration);
}

function postHostMessage(message) {
  if (window.Android?.postMessage) {
    window.Android.postMessage(message);
    return;
  }
  if (window.chrome?.webview) window.chrome.webview.postMessage(message);
}

function rendererName(gl) {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

function currentDay() {
  return new Date().toISOString().slice(0, 10);
}

function updateRecord(action) {
  const date = currentDay();
  if (state.record.date !== date) state.record = { date, count: 0, lastAction: "" };
  state.record.count += 1;
  state.record.lastAction = action;
}

function statusSummary() {
  const values = Object.values(state.stats);
  const average = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
  if (state.stats.thirst < 25) return "有点口渴";
  if (state.stats.hunger < 25) return "肚子饿啦";
  if (state.stats.energy < 25) return "需要休息";
  if (state.stats.cleanliness < 25) return "想洗香香";
  if (average > 80) return "元气满满";
  if (average > 55) return "状态不错";
  return "陪陪啾啾吧";
}

function updateStatusUI() {
  const labels = ["hunger", "thirst", "happiness", "energy", "cleanliness"];
  labels.forEach((name) => {
    const value = Math.round(clamp(state.stats[name]));
    const valueElement = document.querySelector(`#${name}-value`);
    const barElement = document.querySelector(`#${name}-bar`);
    if (valueElement) valueElement.textContent = `${value}%`;
    if (barElement) barElement.style.width = `${value}%`;
  });
  document.querySelector("#status-summary").textContent = statusSummary();
  document.querySelector("#food-count").textContent = state.inventory.food;
  document.querySelector("#water-count").textContent = state.inventory.water;
  document.querySelector("#today-record").textContent = state.record.count ? `${state.record.count} 次互动 · 最近${state.record.lastAction}` : "还没有记录";
  document.querySelector("#mood-status").textContent = `${statusSummary()} · 今天也要和你一起玩`;
  autoToggle.checked = Boolean(state.settings.autoBehavior);
  autoInterval.value = String(state.settings.autoInterval);
  qualitySelect.value = String(quality);
  if (scaleRange) scaleRange.value = String(petScale);
  if (scaleValue) scaleValue.textContent = `${petScale}%`;
}

function adjustStats(delta = {}) {
  Object.entries(delta).forEach(([name, amount]) => {
    if (name in state.stats) state.stats[name] = clamp(state.stats[name] + amount);
  });
}

function setAnimation(name, loop = false) {
  if (!animationState || !skeleton) return;
  // Reset slot attachments before switching so a full-frame feeding/drinking
  // pose never leaves the layered rig hidden after the action completes.
  skeleton.setToSetupPose();
  skeleton.updateWorldTransform(spine.Physics.update);
  clearPhotoActionBlend();
  const entry = animationState.setAnimation(0, name, loop);
  entry.mixDuration = name === "idle" ? 0.34 : 0.5;
  entry.listener = {
    complete: () => {
      if (!loop && currentAnimation === name) {
        if (actionRun?.animation === name) actionRun.completed = true;
        setAnimation("idle", true);
      }
    },
  };
  currentAnimation = name;
  motionStatus.textContent = animationLabels[name] || name;
  document.querySelectorAll(".action").forEach((button) => {
    button.classList.toggle("active", button.dataset.animation === name);
  });
}

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function clearPhotoActionBlend() {
  if (!skeleton) return;
  const currentSlot = skeleton.findSlot("real-action");
  const nextSlot = skeleton.findSlot("real-action-next");
  if (currentSlot) {
    currentSlot.setAttachment(null);
    currentSlot.color.a = 1;
  }
  if (nextSlot) {
    nextSlot.setAttachment(null);
    nextSlot.color.a = 1;
  }
}

function setLayeredActionPose(actionName) {
  const layers = [
    ["tail", "rig-tail"],
    ["body", "rig-body"],
    ["paw-left", "rig-paw-left"],
    ["paw-right", "rig-paw-right"],
    ["head", "rig-head"],
    ["ear-left", "rig-ear-left"],
    ["ear-right", "rig-ear-right"],
  ];
  layers.forEach(([slotName, attachmentName]) => {
    const slot = skeleton.findSlot(slotName);
    if (slot) slot.setAttachment(skeleton.getAttachment(slot.data.index, attachmentName));
  });
  ["prop-food", "prop-water", "prop-ball"].forEach((slotName) => {
    const slot = skeleton.findSlot(slotName);
    if (!slot) return;
    const attachmentName = actionName === "feeding" && slotName === "prop-food"
      ? "rig-food-bowl"
      : actionName === "drinking" && slotName === "prop-water"
        ? "rig-water-bowl"
        : null;
    slot.setAttachment(attachmentName ? skeleton.getAttachment(slot.data.index, attachmentName) : null);
  });
  clearPhotoActionBlend();
}

function sampleActionMeshPose(actionName, time) {
  const definition = actionMesh?.actions?.[actionName];
  const samples = definition?.samples;
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const clampedTime = Math.max(0, Math.min(Number(definition.duration) || 0, Number(time) || 0));
  if (clampedTime <= Number(samples[0].time) || samples.length === 1) return samples[0].bones || {};

  let rightIndex = samples.length - 1;
  for (let index = 1; index < samples.length; index += 1) {
    if (clampedTime <= Number(samples[index].time)) {
      rightIndex = index;
      break;
    }
  }
  const left = samples[rightIndex - 1];
  const right = samples[rightIndex];
  const span = Math.max(0.0001, Number(right.time) - Number(left.time));
  const amount = smoothStep((clampedTime - Number(left.time)) / span);
  const pose = {};
  const boneNames = new Set([...Object.keys(left.bones || {}), ...Object.keys(right.bones || {})]);
  const properties = ["rotate", "scaleX", "scaleY", "x", "y"];
  boneNames.forEach((boneName) => {
    const leftBone = left.bones?.[boneName] || {};
    const rightBone = right.bones?.[boneName] || leftBone;
    const values = {};
    properties.forEach((property) => {
      const leftValue = leftBone[property];
      const rightValue = rightBone[property];
      if (leftValue === undefined && rightValue === undefined) return;
      const fallback = property === "scaleX" || property === "scaleY" ? 1 : 0;
      const from = Number(leftValue ?? rightValue ?? fallback);
      const to = Number(rightValue ?? leftValue ?? fallback);
      values[property] = from + (to - from) * amount;
    });
    pose[boneName] = values;
  });
  return pose;
}

function applyActionMeshPose(actionName) {
  const pose = sampleActionMeshPose(actionName, animationState.getCurrent(0)?.trackTime || 0);
  if (!pose) return false;
  setLayeredActionPose(actionName);
  Object.entries(pose).forEach(([boneName, values]) => {
    const bone = skeleton.findBone(boneName);
    if (!bone) return;
    if (Number.isFinite(values.rotate)) bone.rotation = Number(bone.data.rotation || 0) + values.rotate;
    if (Number.isFinite(values.scaleX)) bone.scaleX = Number(bone.data.scaleX || 1) * values.scaleX;
    if (Number.isFinite(values.scaleY)) bone.scaleY = Number(bone.data.scaleY || 1) * values.scaleY;
    if (Number.isFinite(values.x)) bone.x = Number(bone.data.x || 0) + values.x;
    if (Number.isFinite(values.y)) bone.y = Number(bone.data.y || 0) + values.y;
  });
  return true;
}

function applyPhotoActionBlend() {
  if (!fullPoseMode && actionRenderer !== "photo-flow") {
    if (currentAnimation === "feeding" || currentAnimation === "drinking") {
      if (!applyActionMeshPose(currentAnimation)) setLayeredActionPose(currentAnimation);
    }
    return;
  }
  const timeline = photoActionTimelines[currentAnimation];
  const currentSlot = skeleton?.findSlot("real-action");
  const nextSlot = skeleton?.findSlot("real-action-next");
  if (!timeline || !currentSlot || !nextSlot) {
    clearPhotoActionBlend();
    return;
  }

  const entry = animationState.getCurrent(0);
  const time = entry ? entry.trackTime : 0;
  if (time < timeline.times[0] || time >= timeline.end) {
    clearPhotoActionBlend();
    return;
  }

  let frame = timeline.times.length - 1;
  for (let index = 0; index < timeline.times.length - 1; index += 1) {
    if (time < timeline.times[index + 1]) {
      frame = index;
      break;
    }
  }

  const frameStart = timeline.times[frame];
  const frameEnd = frame + 1 < timeline.times.length ? timeline.times[frame + 1] : timeline.end;
  const blendWindow = Math.min(0.08, (frameEnd - frameStart) * 0.14);
  const blend = frame + 1 < timeline.times.length
    ? smoothStep((time - (frameEnd - blendWindow)) / blendWindow)
    : 0;

  currentSlot.setAttachment(skeleton.getAttachment(currentSlot.data.index, `${timeline.prefix}-${frame}`));
  currentSlot.color.a = 1 - blend;
  if (blend > 0) {
    nextSlot.setAttachment(skeleton.getAttachment(nextSlot.data.index, `${timeline.prefix}-${frame + 1}`));
    nextSlot.color.a = blend;
  } else {
    nextSlot.setAttachment(null);
    nextSlot.color.a = 1;
  }
}

const actionEffects = {
  petting: { label: "摸摸头", animation: "petting", stats: { happiness: 4 }, commitAfter: 700, startMessage: "啾啾把小脑袋凑过来了", message: "啾啾舒服地眯起眼睛" },
  handshake: { label: "握手", stats: { energy: -2, happiness: 2 }, commitAfter: 1050, startMessage: "啾啾伸出小爪爪", message: "啾啾和你握手啦" },
  waiting: { label: "等待", loop: true, commitAfter: 500, startMessage: "啾啾抬头等你回应", message: "啾啾还在期待你" },
  feeding: { label: "喂食", stats: { hunger: 24, energy: -1, happiness: 3 }, inventory: "food", commitAfter: 2350, startMessage: "饭碗出现啦，啾啾闻到香味了", message: "饭饭吃饱啦，啾啾舔舔嘴" },
  drinking: { label: "喝水", stats: { thirst: 28, energy: 1, happiness: 2 }, inventory: "water", commitAfter: 2200, startMessage: "水碗放好啦，啾啾准备喝水", message: "咕咚咕咚，喝完水好舒服" },
  playing: { label: "玩球", stats: { energy: -13, hunger: -4, thirst: -5, happiness: 12 }, commitAfter: 2600, startMessage: "小球滚过来啦", message: "和啾啾玩得真开心" },
  sleeping: { label: "睡觉", stats: { energy: 12, hunger: -1, thirst: -1 }, commitAfter: 2100, startMessage: "啾啾钻进小窝了", message: "嘘，啾啾做了个好梦" },
  rest: { label: "休息", animation: "sleeping", stats: { energy: 18, hunger: -1, thirst: -1 }, commitAfter: 1800, startMessage: "啾啾先安静休息一会儿", message: "休息好了，啾啾又有精神啦" },
  cleaning: { label: "清洁", animation: "cleaning", stats: { cleanliness: 28, happiness: 2 }, commitAfter: 1500, startMessage: "拿出软软的小梳子", message: "毛毛整理得香喷喷" },
};

function clearActionRun() {
  clearTimeout(actionCommitTimer);
  actionCommitTimer = null;
  actionRun = null;
}

function commitAction(run) {
  if (!actionRun || actionRun.id !== run.id || actionRun.committed) return;
  if (run.effect.inventory && state.inventory[run.effect.inventory] <= 0) {
    showToast(run.effect.inventory === "food" ? "饭碗空了，这次没有扣除库存" : "水碗空了，这次没有扣除库存");
    actionRun.committed = true;
    return;
  }
  if (run.effect.inventory) state.inventory[run.effect.inventory] -= 1;
  adjustStats(run.effect.stats);
  updateRecord(run.effect.label);
  actionRun.committed = true;
  saveState();
  updateStatusUI();
  dragStatus.textContent = `刚刚完成 · ${run.effect.label}`;
  showPetBubble(run.effect.message);
  showToast(run.effect.message);
}

function triggerAction(actionName, fromAuto = false) {
  const effect = actionEffects[actionName];
  if (!effect) return;
  const animation = effect.animation || actionName;
  if (actionRun && !actionRun.completed && actionRun.name === actionName) {
    showPetBubble("啾啾正在做这件事呢");
    return;
  }
  if (effect.inventory && state.inventory[effect.inventory] <= 0) {
    showPetBubble(effect.inventory === "food" ? "饭碗空了，先补充食物吧" : "水碗空了，先补充饮水吧");
    showToast(effect.inventory === "food" ? "饭碗空了，先补充食物吧" : "水碗空了，先补充饮水吧");
    return;
  }
  if (actionName === "feeding" && state.stats.hunger >= 96) {
    showPetBubble("啾啾已经吃得饱饱的啦");
    return;
  }
  if (actionName === "drinking" && state.stats.thirst >= 96) {
    showPetBubble("啾啾现在一点也不渴啦");
    return;
  }

  clearActionRun();
  const run = { id: Date.now() + Math.random(), name: actionName, animation, effect, committed: false, completed: false };
  actionRun = run;
  setAnimation(animation, effect.loop === true && !fromAuto);
  dragStatus.textContent = fromAuto ? `自动行为 · ${effect.label}` : `正在进行 · ${effect.label}`;
  showPetBubble(effect.startMessage || effect.message);
  actionCommitTimer = setTimeout(() => commitAction(run), effect.commitAfter ?? 0);
  scheduleAutoBehavior();
}

function resizeRenderer() {
  if (!spineCanvas) return;
  spineCanvas.renderer.resize(spine.ResizeMode.Fit);
  spineCanvas.renderer.camera.zoom = desktopMode ? 0.76 : 0.82;
  spineCanvas.renderer.camera.update();
}

function worldPerCssPixel() {
  return spineCanvas.renderer.camera.viewportWidth / canvasElement.clientWidth;
}

function beginDrag(event) {
  if (!skeleton) return;
  if (desktopMode) {
    event.preventDefault();
    if (!mobileMode) postHostMessage("drag-window");
    return;
  }
  canvasElement.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: targetPosition.x,
    originY: targetPosition.y,
    lastX: targetPosition.x,
    lastY: targetPosition.y,
    lastTime: performance.now(),
  };
  velocity = { x: 0, y: 0 };
  dragStatus.textContent = "正在拖动 · 1:1 跟手中";
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const scale = worldPerCssPixel();
  const nextX = drag.originX + (event.clientX - drag.startX) * scale;
  const nextY = drag.originY - (event.clientY - drag.startY) * scale;
  const now = performance.now();
  const seconds = Math.max(0.001, (now - drag.lastTime) / 1000);
  velocity.x = (nextX - drag.lastX) / seconds;
  velocity.y = (nextY - drag.lastY) / seconds;
  drag.lastX = nextX;
  drag.lastY = nextY;
  drag.lastTime = now;
  targetPosition.x = nextX;
  targetPosition.y = nextY;
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag = null;
  dragStatus.textContent = "松开后会有轻微惯性";
}

function advanceMotion(step) {
  animationState.update(step);
  animationState.apply(skeleton);
  applyPhotoActionBlend();

  if (!drag) {
    targetPosition.x += velocity.x * step;
    targetPosition.y += velocity.y * step;
    const decay = Math.exp(-7 * step);
    velocity.x *= decay;
    velocity.y *= decay;
  }

  // Pointer dragging is direct manipulation: keep the skeleton on the live
  // target while grabbed, then ease only the released/inertial motion.
  const follow = drag ? 1 : 1 - Math.exp(-24 * step);
  skeleton.x += (targetPosition.x - skeleton.x) * follow;
  skeleton.y += (targetPosition.y - skeleton.y) * follow;
  skeleton.updateWorldTransform(spine.Physics.update);
  simulationFrames += 1;
}

function updateFrameTelemetry(delta) {
  measuredFrames += 1;
  measuredElapsed += delta;
  if (measuredElapsed >= 0.5) {
    actualFps = Math.round(measuredFrames / measuredElapsed);
    fpsStatus.textContent = `${actualFps} FPS`;
    measuredFrames = 0;
    measuredElapsed = 0;
  }
  window.__jujuDiagnostics.actualFps = actualFps;
  window.__jujuDiagnostics.simulationFrames = simulationFrames;
  window.__jujuDiagnostics.lastDelta = delta;
  window.__jujuDiagnostics.currentAnimation = currentAnimation;
  window.__jujuDiagnostics.attachments = ["pet", "real-action", "real-action-next"].map((slotName) => {
    const attachment = skeleton?.findSlot(slotName)?.getAttachment();
    return {
      slot: slotName,
      name: attachment?.name || null,
      region: attachment?.region?.name || null,
      page: attachment?.region?.page?.name || null,
      alpha: skeleton?.findSlot(slotName)?.color.a ?? 0,
    };
  });
}

function scheduleAutoBehavior() {
  clearTimeout(autoTimer);
  if (!state.settings.autoBehavior) return;
  autoTimer = setTimeout(() => {
    applyElapsedDecay();
    if (currentAnimation === "idle" && !drag) {
      const choice = state.stats.energy < 32 ? "rest" : state.stats.happiness < 45 ? "playing" : "waiting";
      triggerAction(choice, true);
    }
    scheduleAutoBehavior();
  }, Math.max(1, Number(state.settings.autoInterval) || 30) * 60000);
}

function showWindowActions() {
  if (!desktopMode || !windowActions) return;
  clearTimeout(windowActionsHideTimer);
  document.body.classList.add("pet-hover");
}

function hideWindowActionsSoon() {
  if (!desktopMode || !windowActions) return;
  clearTimeout(windowActionsHideTimer);
  windowActionsHideTimer = setTimeout(() => {
    if (!canvasElement.matches(":hover") && !windowActions.matches(":hover") && !windowActions.matches(":focus-within")) {
      document.body.classList.remove("pet-hover");
    }
  }, 260);
}

canvasElement.addEventListener("pointerdown", beginDrag);
canvasElement.addEventListener("pointermove", moveDrag);
canvasElement.addEventListener("pointerup", endDrag);
canvasElement.addEventListener("pointercancel", endDrag);
canvasElement.addEventListener("pointerenter", showWindowActions);
canvasElement.addEventListener("pointerleave", hideWindowActionsSoon);
windowActions?.addEventListener("pointerenter", showWindowActions);
windowActions?.addEventListener("pointerleave", hideWindowActionsSoon);
window.addEventListener("resize", resizeRenderer);
document.querySelectorAll("[data-host-action]").forEach((element) => {
  element.addEventListener("pointerdown", (event) => {
    if (element.dataset.hostAction === "drag") {
      event.preventDefault();
      postHostMessage("drag-window");
    }
  });
  element.addEventListener("click", () => {
    const action = element.dataset.hostAction;
    if (action === "close") postHostMessage("close-window");
    if (action === "minimize") postHostMessage("minimize-window");
  });
});

function setPanelOpen(opened) {
  document.body.classList.toggle("panel-open", opened);
  panelToggle.setAttribute("aria-expanded", String(opened));
  panelToggle.title = opened ? "收起照顾面板" : "打开照顾面板";
  postHostMessage(opened ? "panel-open" : "panel-close");
  if (!opened) {
    panelClose?.blur();
    panelToggle?.blur();
  }
}

panelToggle?.addEventListener("click", () => {
  setPanelOpen(!document.body.classList.contains("panel-open"));
});

panelClose?.addEventListener("click", () => {
  setPanelOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && desktopMode && document.body.classList.contains("panel-open")) {
    event.preventDefault();
    setPanelOpen(false);
  }
});

document.querySelectorAll(".action").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action || button.dataset.animation;
    if (action === "idle") {
      clearActionRun();
      setAnimation("idle", true);
      motionStatus.textContent = animationLabels.idle;
      dragStatus.textContent = "啾啾在等你";
      return;
    }
    triggerAction(action);
  });
});

document.querySelectorAll(".care-item, .quick-action").forEach((button) => button.addEventListener("click", () => triggerAction(button.dataset.action)));

debugToggle.addEventListener("change", () => {
  if (spineCanvas) spineCanvas.renderer.skeletonDebugRenderer.drawBones = debugToggle.checked;
});

qualitySelect.addEventListener("change", () => {
  quality = normalizeQuality(qualitySelect.value);
  state.settings.quality = quality;
  saveState();
  updateQualityUI();
});

scaleRange.addEventListener("input", () => {
  petScale = normalizeScale(scaleRange.value);
  state.settings.scale = petScale;
  saveState();
  updateScaleUI();
});

autoToggle.addEventListener("change", () => {
  state.settings.autoBehavior = autoToggle.checked;
  saveState();
  scheduleAutoBehavior();
  showToast(autoToggle.checked ? "自动行为已开启" : "自动行为已暂停");
});

autoInterval.addEventListener("change", () => {
  state.settings.autoInterval = Number(autoInterval.value) || 30;
  saveState();
  scheduleAutoBehavior();
});

document.querySelector("#reset-state").addEventListener("click", () => {
  if (!window.confirm("要把啾啾的状态和库存恢复到初始值吗？")) return;
  clearActionRun();
  state = { ...defaultState, stats: { ...defaultState.stats }, inventory: { ...defaultState.inventory }, settings: { ...defaultState.settings }, record: { ...defaultState.record }, lastUpdated: Date.now() };
  quality = normalizeQuality(state.settings.quality);
  saveState();
  updateStatusUI();
  updateQualityUI();
  petScale = normalizeScale(state.settings.scale);
  updateScaleUI();
  setAnimation("idle", true);
  showToast("啾啾已经恢复元气");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    applyElapsedDecay();
    updateStatusUI();
  }
});

const app = {
  loadAssets: (host) => {
    host.assetManager.loadJson("full-pet.json");
    host.assetManager.loadJson("action-mesh-30.json");
    host.assetManager.loadTextureAtlas("full-pet.atlas");
  },

  initialize: (host) => {
    try {
      const atlas = host.assetManager.require("full-pet.atlas");
      const json = host.assetManager.require("full-pet.json");
      actionMesh = host.assetManager.require("action-mesh-30.json");
      const loader = new spine.AtlasAttachmentLoader(atlas);
      const skeletonJson = new spine.SkeletonJson(loader);
      const skeletonData = skeletonJson.readSkeletonData(json);

      skeleton = new spine.Skeleton(skeletonData);
      skeleton.scaleX = 1.36;
      skeleton.scaleY = 1.36;
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform(spine.Physics.update);
      targetPosition = { x: skeleton.x, y: skeleton.y };

      const stateData = new spine.AnimationStateData(skeletonData);
      stateData.defaultMix = 0.32;
      animationState = new spine.AnimationState(stateData);
      setAnimation("idle", true);

      spineCanvas = host;
      updateScaleUI();
      resizeRenderer();
      const renderer = host.renderer;
      renderer.skeletonDebugRenderer.drawBones = false;
      renderer.skeletonDebugRenderer.drawRegionAttachments = false;
      const name = rendererName(host.gl);
      document.querySelector("#renderer-value");
      setPill(spineStatus, "Spine 已连接", "ok");
      setPill(gpuStatus, "WebGL GPU 已启用", "ok");
      setPill(rigStatus, "整帧姿态已启用", "ok");
      rigStatus.title = `整帧照片姿态 · Spine GPU 渲染 · ${actionMesh.sampleCount || 30} 点动作数据已保留`;
      window.__jujuDiagnostics.actionMeshLoaded = true;
      window.__jujuDiagnostics.actionMeshSampleCount = Number(actionMesh.sampleCount) || 0;
      if (name) gpuStatus.title = name;
      loadingElement.hidden = true;
      updateStatusUI();
      updateQualityUI();
      scheduleAutoBehavior();
    } catch (error) {
      setError(`Spine 资源解析失败：\n${error.message}`);
    }
  },

  update: (_host, delta) => {
    if (!skeleton || !animationState) return;
    const cappedDelta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    motionAccumulator = Math.min(motionAccumulator + cappedDelta, 0.25);
    // Spine already interpolates its timelines against real elapsed time.
    // Replaying the same frame in 3–15 tiny substeps per display refresh only
    // burns CPU in WebView2 (especially inside a transparent WPF window) and
    // creates visible hitching on slower machines. Consume the accumulated
    // time once; the quality setting remains the user's target motion tier.
    const step = motionAccumulator;
    motionAccumulator = 0;
    if (step > 0) advanceMotion(step);
    updateFrameTelemetry(cappedDelta);
  },

  render: (host) => {
    host.clear(0, 0, 0, 0);
    if (!skeleton) return;
    host.renderer.begin();
    host.renderer.drawSkeleton(skeleton, false);
    if (debugToggle.checked) host.renderer.drawSkeletonDebug(skeleton, false);
    host.renderer.end();
  },

  error: (_host, errors) => setError(`资源加载失败：\n${Object.values(errors).join("\n")}`),
};

applyElapsedDecay();
saveState();
updateStatusUI();

try {
  spineCanvas = new spine.SpineCanvas(canvasElement, {
    pathPrefix: "spine/",
    webglConfig: { alpha: true, antialias: true, premultipliedAlpha: false },
    app,
  });
} catch (error) {
  setError(`WebGL 初始化失败：\n${error.message}`);
}
