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
const contextMenu = document.querySelector("#context-menu");
const importFile = document.querySelector("#import-file");
const playBall = document.querySelector("#play-ball");
const dirtOverlay = document.querySelector("#dirt-overlay");
const equipmentOverlay = document.querySelector("#equipment-overlay");
const equipmentToggle = document.querySelector("#equipment-toggle");
const muteToggle = document.querySelector("#mute-toggle");
const volumeRange = document.querySelector("#volume-range");
const volumeValue = document.querySelector("#volume-value");
const growthStatus = document.querySelector("#growth-status");
const achievementList = document.querySelector("#achievement-list");
const desktopMode = new URLSearchParams(window.location.search).get("host") === "desktop";
const mobileMode = new URLSearchParams(window.location.search).get("mobile") === "1";
const storageKey = "juju-pet-state-v2";
const statFloor = 15;
const inventoryCaps = { food: 10, water: 10 };
const dailySupply = { food: 5, water: 5 };
const decayRates = { hunger: 0.75, thirst: 1.05, energy: 0.25, cleanliness: 0.35, happiness: 0.2 };

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
  settings: { autoBehavior: true, autoInterval: 30, quality: 60, scale: 100, muted: false, volume: 55, accessory: false },
  record: { date: "", count: 0, totalCount: 0, lastAction: "" },
  dailySupplyDate: "",
  growth: { xp: 0, level: 1, achievements: [] },
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
let motionAccumulator = 0;
let measuredFrames = 0;
let measuredElapsed = 0;
let actualFps = 0;
let simulationFrames = 0;
let windowActionsHideTimer = null;
let decayTimer = null;
let wanderTimer = null;
let pendingTapTimer = null;
let lastNeedAlert = "";
let audioContext = null;
let hostState = { paused: false, reducedMotion: false, locked: false, timeOfDay: "day" };
let ballDrag = null;

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
  photoActionRenderer: "photo-flow",
  actionMeshInterpolation: false,
  actionMeshLoaded: false,
  actionMeshActive: false,
  actionMeshSampleCount: 0,
  layeredRigActive: false,
  layeredRigAvailable: false,
  lastDelta: 0,
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeQuality(value) {
  const candidate = Number(value);
  return [30, 60, 90].includes(candidate) ? candidate : 60;
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
  const effectiveQuality = hostState.reducedMotion ? Math.min(quality, 30) : quality;
  if (note) note.textContent = `动画更新上限 ${effectiveQuality} FPS · ${hostState.reducedMotion ? "宿主节能" : quality === 30 ? "节能" : quality === 90 ? "流畅" : "标准"}`;
  if (interpolationStatus) interpolationStatus.textContent = hostState.reducedMotion ? "宿主降帧" : "Spine 补帧开启";
  window.__jujuDiagnostics.targetMotionHz = effectiveQuality;
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
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null") || {};
    const merged = {
      ...defaultState,
      ...saved,
      stats: { ...defaultState.stats, ...(saved?.stats || {}) },
      inventory: { ...defaultState.inventory, ...(saved?.inventory || {}) },
      settings: { ...defaultState.settings, ...(saved?.settings || {}) },
      record: { ...defaultState.record, ...(saved?.record || {}) },
      growth: { ...defaultState.growth, ...(saved?.growth || {}) },
    };
    Object.keys(merged.stats).forEach((name) => { merged.stats[name] = clamp(merged.stats[name]); });
    Object.keys(inventoryCaps).forEach((name) => {
      merged.inventory[name] = Math.max(0, Math.min(inventoryCaps[name], Math.floor(Number(merged.inventory[name]) || 0)));
    });
    merged.settings.autoBehavior = Boolean(merged.settings.autoBehavior);
    merged.settings.autoInterval = [15, 30, 60].includes(Number(merged.settings.autoInterval)) ? Number(merged.settings.autoInterval) : 30;
    merged.settings.quality = normalizeQuality(merged.settings.quality);
    merged.settings.scale = normalizeScale(merged.settings.scale);
    merged.settings.muted = Boolean(merged.settings.muted);
    merged.settings.volume = clamp(merged.settings.volume, 0, 100);
    merged.settings.accessory = Boolean(merged.settings.accessory);
    merged.record.count = Math.max(0, Math.floor(Number(merged.record.count) || 0));
    merged.record.totalCount = Math.max(merged.record.count, Math.floor(Number(merged.record.totalCount) || 0));
    merged.growth.xp = Math.max(0, Math.floor(Number(merged.growth.xp) || 0));
    merged.growth.level = Math.max(1, Math.floor(Number(merged.growth.level) || 1));
    merged.growth.achievements = Array.isArray(merged.growth.achievements) ? merged.growth.achievements.filter((item) => typeof item === "string") : [];
    return merged;
  } catch (_error) {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState(updateTimestamp = true) {
  if (updateTimestamp) state.lastUpdated = Date.now();
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_error) { /* localStorage can be disabled in private contexts */ }
  if (desktopMode || mobileMode) postHostMessage(JSON.stringify({ type: "state-save", state }));
}

function applyElapsedDecay(now = Date.now()) {
  const lastUpdated = Number(state.lastUpdated);
  const elapsedMinutes = Number.isFinite(lastUpdated) ? Math.max(0, (now - lastUpdated) / 60000) : 0;
  let changed = false;
  Object.entries(decayRates).forEach(([name, rate]) => {
    const next = Math.max(statFloor, clamp(Number(state.stats[name]) - elapsedMinutes * rate));
    if (next !== state.stats[name]) changed = true;
    state.stats[name] = next;
  });
  if (elapsedMinutes > 0 || changed) {
    state.lastUpdated = now;
    saveState();
  }
  return changed;
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

function updateCareVisuals() {
  const dirty = Number(state.stats.cleanliness) < 40;
  if (dirtOverlay) dirtOverlay.hidden = !dirty;
  if (equipmentOverlay) equipmentOverlay.hidden = !state.settings.accessory;
  document.body.classList.toggle("pet-dirty", dirty);
  document.body.classList.toggle("pet-equipped", Boolean(state.settings.accessory));
}

const achievementLabels = {
  first: "第一次照顾",
  three: "连续陪伴 3 次",
  clean: "毛毛香喷喷",
  daily: "今日陪伴 5 次",
};

function updateGrowthUI() {
  if (growthStatus) growthStatus.textContent = `Lv.${state.growth.level} · ${state.growth.xp} XP`;
  if (!achievementList) return;
  achievementList.replaceChildren();
  const earned = state.growth.achievements;
  Object.entries(achievementLabels).forEach(([key, label]) => {
    const item = document.createElement("li");
    item.textContent = `${earned.includes(key) ? "✓" : "○"} ${label}`;
    item.className = earned.includes(key) ? "earned" : "locked";
    achievementList.append(item);
  });
}

function awardGrowth(actionLabel) {
  state.growth.xp += 2;
  state.growth.level = 1 + Math.floor(state.growth.xp / 10);
  const total = state.record.totalCount;
  const candidates = [
    ["first", total >= 1],
    ["three", total >= 3],
    ["clean", actionLabel === "清洁" && state.stats.cleanliness >= 70],
    ["daily", state.record.count >= 5],
  ];
  candidates.forEach(([key, condition]) => {
    if (!condition || state.growth.achievements.includes(key)) return;
    state.growth.achievements.push(key);
    showToast(`成就解锁 · ${achievementLabels[key]}`);
  });
}

function checkLowNeeds() {
  const low = [];
  if (state.stats.hunger < 25) low.push("hunger");
  if (state.stats.thirst < 25) low.push("thirst");
  if (low.length === 0) {
    lastNeedAlert = "";
    return;
  }
  const key = low.join(",");
  if (key === lastNeedAlert) return;
  lastNeedAlert = key;
  const message = low.includes("hunger") && low.includes("thirst") ? "啾啾又饿又渴，想要一点照顾" : low[0] === "hunger" ? "啾啾肚子饿啦，想吃饭饭" : "啾啾有点口渴，想喝水水";
  showPetBubble(message, 5000);
  if (!hostState.paused && !hostState.locked && !actionRun && animationState) setAnimation("waiting", true);
  postHostMessage(`notify:${message}`);
  postHostMessage(JSON.stringify({ type: "notify", message }));
}

function playSound(actionName) {
  if (state.settings.muted) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext ||= new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const frequency = actionName === "drinking" ? 520 : actionName === "feeding" ? 260 : actionName === "sleeping" || actionName === "rest" ? 110 : actionName === "running" ? 420 : 330;
    oscillator.type = actionName === "sleeping" || actionName === "rest" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.72), now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.005, state.settings.volume / 1000), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  } catch (_error) { /* sound is an enhancement; a blocked audio context must not break care actions */ }
}

function setHostState(nextState = {}) {
  const previous = hostState;
  hostState = {
    ...hostState,
    paused: Boolean(nextState.paused ?? hostState.paused),
    reducedMotion: Boolean(nextState.reducedMotion ?? nextState.reduceMotion ?? hostState.reducedMotion),
    locked: Boolean(nextState.locked ?? hostState.locked),
    timeOfDay: ["morning", "day", "evening", "night"].includes(nextState.timeOfDay) ? nextState.timeOfDay : hostState.timeOfDay,
  };
  document.body.classList.toggle("host-paused", hostState.paused);
  document.body.classList.toggle("host-locked", hostState.locked);
  updateQualityUI();
  if (hostState.locked) {
    clearActionRun();
    setAnimation("sleeping", true);
    showPetBubble("屏幕锁定啦，啾啾先安静睡觉", 3600);
  } else if (hostState.timeOfDay === "night") {
    clearActionRun();
    setAnimation("sleeping", true);
    showPetBubble("夜深啦，啾啾陪你一起休息", 3600);
  } else if (previous.locked || previous.timeOfDay === "night") {
    setAnimation("idle", true);
    showPetBubble(hostState.timeOfDay === "morning" ? "早安！啾啾醒来啦" : "啾啾回来陪你啦", 3600);
  } else if (hostState.paused) {
    showPetBubble("啾啾先暂停一下，等你回来", 3600);
  } else if (hostState.timeOfDay === "morning") {
    showPetBubble("早安！今天也要一起玩", 3600);
  }
  scheduleAutoBehavior();
}

function receiveHostMessage(rawMessage) {
  let message = rawMessage;
  if (typeof message === "string") {
    if (message.startsWith("host-state:")) {
      try { message = JSON.parse(message.slice("host-state:".length)); } catch (_error) { return; }
    } else if (message === "host-paused") message = { type: "host-state", paused: true };
    else if (message === "host-resumed") message = { type: "host-state", paused: false };
    else if (message === "host-locked") message = { type: "host-state", locked: true };
    else if (message === "host-unlocked") message = { type: "host-state", locked: false, timeOfDay: "morning" };
    else return;
  }
  if (!message || typeof message !== "object") return;
  if (message.type === "host-state") {
    if (message.event === "restore-state" && message.state) applyImportedState(message.state, true);
    else if (message.event === "session-lock") setHostState({ ...message, locked: true, paused: true });
    else if (message.event === "session-unlock") {
      setHostState({ ...message, locked: false, paused: false, timeOfDay: "morning" });
      if (message.greeting) showPetBubble(message.greeting, 3600);
    } else setHostState(message);
    if (message.event === "battery" && message.greeting) showPetBubble(message.greeting, 3600);
  }
  if (message.type === "state-restore" && message.state) applyImportedState(message.state, true);
}

window.addEventListener("message", (event) => receiveHostMessage(event.data));
window.chrome?.webview?.addEventListener("message", (event) => receiveHostMessage(event.data));

function normalizeSnapshot(snapshot) {
  const candidate = snapshot?.state && typeof snapshot.state === "object" ? snapshot.state : snapshot;
  if (!candidate || typeof candidate !== "object" || !candidate.stats || !candidate.inventory) throw new Error("存档缺少状态或库存");
  const next = {
    ...defaultState,
    ...candidate,
    stats: { ...defaultState.stats, ...(candidate.stats || {}) },
    inventory: { ...defaultState.inventory, ...(candidate.inventory || {}) },
    settings: { ...defaultState.settings, ...(candidate.settings || {}) },
    record: { ...defaultState.record, ...(candidate.record || {}) },
    growth: { ...defaultState.growth, ...(candidate.growth || {}) },
  };
  Object.keys(decayRates).forEach((name) => { next.stats[name] = clamp(next.stats[name]); });
  Object.keys(inventoryCaps).forEach((name) => { next.inventory[name] = Math.max(0, Math.min(inventoryCaps[name], Math.floor(Number(next.inventory[name]) || 0))); });
  next.settings.autoBehavior = Boolean(next.settings.autoBehavior);
  next.settings.autoInterval = [15, 30, 60].includes(Number(next.settings.autoInterval)) ? Number(next.settings.autoInterval) : 30;
  next.settings.quality = normalizeQuality(next.settings.quality);
  next.settings.scale = normalizeScale(next.settings.scale);
  next.settings.muted = Boolean(next.settings.muted);
  next.settings.volume = clamp(next.settings.volume, 0, 100);
  next.settings.accessory = Boolean(next.settings.accessory);
  next.record.count = Math.max(0, Math.floor(Number(next.record.count) || 0));
  next.record.totalCount = Math.max(next.record.count, Math.floor(Number(next.record.totalCount) || 0));
  next.growth.xp = Math.max(0, Math.floor(Number(next.growth.xp) || 0));
  next.growth.level = Math.max(1, Math.floor(Number(next.growth.level) || 1));
  next.growth.achievements = Array.isArray(next.growth.achievements) ? next.growth.achievements.filter((item) => typeof item === "string" && Object.hasOwn(achievementLabels, item)) : [];
  return next;
}

function applyImportedState(snapshot, fromHost = false) {
  try {
    state = normalizeSnapshot(snapshot);
    ensureDailySupply();
    applyElapsedDecay();
    saveState();
    quality = state.settings.quality;
    petScale = state.settings.scale;
    updateStatusUI();
    updateQualityUI();
    updateScaleUI();
    setAnimation("idle", true);
    showToast(fromHost ? "已从宿主恢复啾啾存档" : "存档导入成功");
  } catch (error) {
    showToast(`存档导入失败 · ${error.message}`);
  }
}

function exportState() {
  try {
    ensureDailySupply();
    applyElapsedDecay();
    saveState();
    const payload = JSON.stringify({ schema: "juju-pet-state-v3", exportedAt: new Date().toISOString(), state });
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `juju-pet-${currentDay()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    postHostMessage(JSON.stringify({ type: "state-save", state }));
    showToast("存档已导出");
  } catch (_error) {
    showToast("存档导出失败，请稍后再试");
  }
}

async function importStateFile(file) {
  if (!file) return;
  if (file.size > 512 * 1024) {
    showToast("存档文件过大，未导入");
    return;
  }
  try {
    applyImportedState(JSON.parse(await file.text()));
  } catch (_error) {
    showToast("存档不是有效的 JSON");
  } finally {
    if (importFile) importFile.value = "";
  }
}

function rendererName(gl) {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

function currentDay() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function ensureDailySupply() {
  const date = currentDay();
  if (state.dailySupplyDate === date) return false;
  Object.entries(dailySupply).forEach(([name, amount]) => {
    state.inventory[name] = Math.min(inventoryCaps[name], Math.max(0, Number(state.inventory[name]) || 0) + amount);
  });
  state.dailySupplyDate = date;
  saveState(false);
  showToast(`今日补给到账 · 食物 +${dailySupply.food} · 饮水 +${dailySupply.water}`);
  return true;
}

function updateRecord(action) {
  const date = currentDay();
  const previousTotal = Math.max(0, Number(state.record.totalCount) || 0);
  if (state.record.date !== date) state.record = { ...state.record, date, count: 0, lastAction: "" };
  state.record.count += 1;
  state.record.totalCount = previousTotal + 1;
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
  const inventoryFeedback = document.querySelector("#inventory-feedback");
  if (inventoryFeedback && !inventoryFeedback.textContent) inventoryFeedback.textContent = `每日补给 +${dailySupply.food} 食物 / +${dailySupply.water} 饮水 · 上限各 ${inventoryCaps.food}`;
  document.querySelector("#today-record").textContent = state.record.count ? `${state.record.count} 次互动 · 最近${state.record.lastAction}` : "还没有记录";
  document.querySelector("#mood-status").textContent = `${statusSummary()} · 今天也要和你一起玩`;
  autoToggle.checked = Boolean(state.settings.autoBehavior);
  autoInterval.value = String(state.settings.autoInterval);
  qualitySelect.value = String(quality);
  if (scaleRange) scaleRange.value = String(petScale);
  if (scaleValue) scaleValue.textContent = `${petScale}%`;
  if (muteToggle) muteToggle.checked = Boolean(state.settings.muted);
  if (volumeRange) volumeRange.value = String(state.settings.volume);
  if (volumeValue) volumeValue.textContent = `${Math.round(state.settings.volume)}%`;
  if (equipmentToggle) equipmentToggle.checked = Boolean(state.settings.accessory);
  updateCareVisuals();
  updateGrowthUI();
  checkLowNeeds();
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

function applyPhotoActionBlend() {
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
  running: { label: "跳跳", animation: "running", stats: { energy: -2, happiness: 5 }, commitAfter: 900, startMessage: "啾啾开心地跳起来啦", message: "跳得好高，再来一圈" },
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
    updateStatusUI();
    return;
  }
  let consumption = "";
  if (run.effect.inventory) {
    state.inventory[run.effect.inventory] -= 1;
    const label = run.effect.inventory === "food" ? "食物" : "饮水";
    consumption = `消耗 1 份${label} · 剩余 ${state.inventory[run.effect.inventory]}`;
    const inventoryFeedback = document.querySelector("#inventory-feedback");
    if (inventoryFeedback) inventoryFeedback.textContent = `刚刚${consumption}`;
  }
  adjustStats(run.effect.stats);
  updateRecord(run.effect.label);
  awardGrowth(run.effect.label);
  actionRun.committed = true;
  saveState();
  updateStatusUI();
  dragStatus.textContent = `刚刚完成 · ${run.effect.label}`;
  showPetBubble(run.effect.message);
  playSound(run.name);
  showToast(consumption ? `${run.effect.message} · ${consumption}` : run.effect.message);
}

function triggerAction(actionName, fromAuto = false) {
  const effect = actionEffects[actionName];
  if (!effect) return;
  ensureDailySupply();
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
  if (event.button !== undefined && event.button !== 0) return;
  if (desktopMode && mobileMode) return;
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
    startedAt: performance.now(),
    moved: false,
    nativeWindow: desktopMode,
  };
  velocity = { x: 0, y: 0 };
  if (desktopMode) {
    event.preventDefault();
    return;
  }
  dragStatus.textContent = "正在拖动 · 1:1 跟手中";
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (drag.nativeWindow) {
    if (!drag.moved && distance > 8) {
      drag.moved = true;
      postHostMessage("drag-window");
      dragStatus.textContent = "正在拖动窗口";
    }
    return;
  }
  drag.moved = drag.moved || distance > 8;
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

function queuePetTap() {
  if (pendingTapTimer) {
    clearTimeout(pendingTapTimer);
    pendingTapTimer = null;
    triggerAction("running");
    return;
  }
  pendingTapTimer = setTimeout(() => {
    pendingTapTimer = null;
    triggerAction("petting");
  }, 300);
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const released = drag;
  drag = null;
  if (released.nativeWindow) {
    if (!released.moved) queuePetTap();
    return;
  }
  if (!released.moved) queuePetTap();
  else dragStatus.textContent = "松开后会有轻微惯性";
}

function advanceMotion(step) {
  if (hostState.paused || hostState.locked) return;
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
  if (!state.settings.autoBehavior || hostState.paused || hostState.locked || hostState.timeOfDay === "night") return;
  autoTimer = setTimeout(() => {
    applyElapsedDecay();
    if (!hostState.paused && !hostState.locked && currentAnimation === "idle" && !drag) {
      const choice = state.stats.energy < 32 ? "rest" : state.stats.happiness < 45 ? "playing" : "waiting";
      triggerAction(choice, true);
    }
    scheduleAutoBehavior();
  }, Math.max(1, Number(state.settings.autoInterval) || 30) * 60000);
}

function startDecayTimer() {
  clearInterval(decayTimer);
  decayTimer = setInterval(() => {
    ensureDailySupply();
    applyElapsedDecay();
    updateStatusUI();
  }, 60000);
}

function startWanderTimer() {
  clearInterval(wanderTimer);
  if (!desktopMode) return;
  wanderTimer = setInterval(() => {
    if (hostState.paused || hostState.locked || document.body.classList.contains("panel-open") || drag || actionRun || currentAnimation !== "idle") return;
    const direction = Math.random() > 0.5 ? 1 : -1;
    targetPosition.x = Math.max(-110, Math.min(110, targetPosition.x + direction * 46));
    velocity.x = direction * 18;
    setAnimation("running", false);
    showPetBubble("啾啾沿着桌面走走", 1800);
  }, 12000);
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

function hideContextMenu() {
  if (!contextMenu) return;
  contextMenu.hidden = true;
}

function showContextMenu(event) {
  if (!contextMenu) return;
  event.preventDefault();
  contextMenu.hidden = false;
  const width = contextMenu.offsetWidth || 146;
  const height = contextMenu.offsetHeight || 190;
  contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - width - 8)}px`;
  contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - height - 8)}px`;
  contextMenu.querySelector("button")?.focus();
}

function handleContextAction(action) {
  hideContextMenu();
  if (action === "close") {
    if (desktopMode || mobileMode) postHostMessage("close-window");
    else showToast("浏览器体验版不会关闭窗口");
    return;
  }
  triggerAction(action);
}

canvasElement.addEventListener("pointerdown", beginDrag);
canvasElement.addEventListener("pointermove", moveDrag);
canvasElement.addEventListener("pointerup", endDrag);
canvasElement.addEventListener("pointercancel", endDrag);
canvasElement.addEventListener("contextmenu", showContextMenu);
canvasElement.addEventListener("pointerenter", showWindowActions);
canvasElement.addEventListener("pointerleave", hideWindowActionsSoon);
windowActions?.addEventListener("pointerenter", showWindowActions);
windowActions?.addEventListener("pointerleave", hideWindowActionsSoon);
contextMenu?.addEventListener("click", (event) => {
  const action = event.target.closest("[data-context-action]")?.dataset.contextAction;
  if (action) handleContextAction(action);
});
document.addEventListener("pointerdown", (event) => {
  if (contextMenu && !contextMenu.hidden && !contextMenu.contains(event.target)) hideContextMenu();
});
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
  if (event.key === "Escape" && contextMenu && !contextMenu.hidden) {
    event.preventDefault();
    hideContextMenu();
    return;
  }
  if (event.key === "Escape" && document.body.classList.contains("panel-open")) {
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

muteToggle?.addEventListener("change", () => {
  state.settings.muted = muteToggle.checked;
  saveState();
  showToast(state.settings.muted ? "声音已静音" : "声音已开启");
});

volumeRange?.addEventListener("input", () => {
  state.settings.volume = clamp(volumeRange.value, 0, 100);
  if (volumeValue) volumeValue.textContent = `${Math.round(state.settings.volume)}%`;
  saveState();
});

equipmentToggle?.addEventListener("change", () => {
  state.settings.accessory = equipmentToggle.checked;
  saveState();
  updateCareVisuals();
  showToast(equipmentToggle.checked ? "小花领巾已装备（本地装饰）" : "小花领巾已收起");
});

document.querySelector("#export-state")?.addEventListener("click", exportState);
document.querySelector("#import-state")?.addEventListener("click", () => importFile?.click());
importFile?.addEventListener("change", () => importStateFile(importFile.files?.[0]));
document.querySelector("#llm-placeholder")?.addEventListener("click", () => showPetBubble(`${statusSummary()}。这里是离线本地回应，尚未连接对话模型。`, 3600));

playBall?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  playBall.setPointerCapture(event.pointerId);
  ballDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
});
playBall?.addEventListener("pointermove", (event) => {
  if (!ballDrag || ballDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const dx = event.clientX - ballDrag.startX;
  const dy = event.clientY - ballDrag.startY;
  playBall.style.transform = `translate(${dx}px, ${dy}px)`;
});
playBall?.addEventListener("pointerup", (event) => {
  if (!ballDrag || ballDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const distance = Math.hypot(event.clientX - ballDrag.startX, event.clientY - ballDrag.startY);
  ballDrag = null;
  playBall.style.transform = "";
  if (distance > 18) {
    playBall.classList.add("thrown");
    showPetBubble("小球飞出去啦，啾啾去追！");
    triggerAction("running");
    setTimeout(() => playBall.classList.remove("thrown"), 820);
  } else triggerAction("playing");
});
playBall?.addEventListener("pointercancel", () => {
  ballDrag = null;
  playBall.style.transform = "";
});
document.addEventListener("pointerdown", () => audioContext?.resume().catch(() => {}), { passive: true });

document.querySelector("#reset-state").addEventListener("click", () => {
  if (!window.confirm("要把啾啾的状态和库存恢复到初始值吗？")) return;
  clearActionRun();
  state = JSON.parse(JSON.stringify({ ...defaultState, lastUpdated: Date.now() }));
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
    ensureDailySupply();
    applyElapsedDecay();
    updateStatusUI();
    updateQualityUI();
  }
});

const app = {
  loadAssets: (host) => {
    host.assetManager.loadJson("full-pet.json");
    host.assetManager.loadTextureAtlas("full-pet.atlas");
  },

  initialize: (host) => {
    try {
      const atlas = host.assetManager.require("full-pet.atlas");
      const json = host.assetManager.require("full-pet.json");
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
      setPill(rigStatus, "整帧资源已启用", "ok");
      rigStatus.title = "当前资产为单 root 整帧 Spine；分层 rig/动作网格仅保留为后续资产输入，未伪称激活";
      if (name) gpuStatus.title = name;
      loadingElement.hidden = true;
      updateStatusUI();
      updateQualityUI();
      startDecayTimer();
      startWanderTimer();
      scheduleAutoBehavior();
    } catch (error) {
      setError(`Spine 资源解析失败：\n${error.message}`);
    }
  },

  update: (_host, delta) => {
    if (!skeleton || !animationState) return;
    const cappedDelta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    motionAccumulator = Math.min(motionAccumulator + cappedDelta, 0.25);
    const targetInterval = 1 / (hostState.reducedMotion ? Math.min(quality, 30) : quality);
    if (hostState.paused || hostState.locked || motionAccumulator < targetInterval) {
      updateFrameTelemetry(cappedDelta);
      return;
    }
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

ensureDailySupply();
applyElapsedDecay();
saveState();
updateStatusUI();
startDecayTimer();

try {
  spineCanvas = new spine.SpineCanvas(canvasElement, {
    pathPrefix: "spine/",
    webglConfig: { alpha: true, antialias: true, premultipliedAlpha: false },
    app,
  });
} catch (error) {
  setError(`WebGL 初始化失败：\n${error.message}`);
}
