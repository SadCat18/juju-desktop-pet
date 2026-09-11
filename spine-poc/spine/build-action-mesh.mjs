import fs from "node:fs";

const sourcePath = new URL("./juju-poc.json", import.meta.url);
const outputPath = new URL("./action-mesh-30.json", import.meta.url);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const sampleCount = 30;

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function durationOf(value) {
  let duration = 0;
  const walk = (item) => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (!item || typeof item !== "object") return;
    if (typeof item.time === "number") duration = Math.max(duration, item.time);
    Object.values(item).forEach(walk);
  };
  walk(value);
  return duration;
}

function sampleTrack(track, time, property, fallback) {
  if (!Array.isArray(track) || track.length === 0) return fallback;
  if (time <= Number(track[0].time || 0)) return Number(track[0][property] ?? fallback);
  for (let index = 0; index < track.length - 1; index += 1) {
    const left = track[index];
    const right = track[index + 1];
    const leftTime = Number(left.time || 0);
    const rightTime = Number(right.time || 0);
    if (time <= rightTime) {
      const amount = smoothStep((time - leftTime) / Math.max(0.0001, rightTime - leftTime));
      return Number(left[property] ?? fallback) + (Number(right[property] ?? fallback) - Number(left[property] ?? fallback)) * amount;
    }
  }
  return Number(track.at(-1)[property] ?? fallback);
}

function buildAction(name) {
  const animation = source.animations[name];
  const duration = durationOf(animation);
  const samples = [];
  const bones = animation.bones || {};
  const boneNames = Object.keys(bones).filter((boneName) => bones[boneName].rotate || bones[boneName].scale || bones[boneName].translate);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = duration * index / (sampleCount - 1);
    const sample = { time: Number(time.toFixed(6)), bones: {} };
    for (const boneName of boneNames) {
      const tracks = bones[boneName];
      const value = {};
      if (tracks.rotate) value.rotate = Number(sampleTrack(tracks.rotate, time, "value", 0).toFixed(4));
      if (tracks.scale) {
        value.scaleX = Number(sampleTrack(tracks.scale, time, "x", 1).toFixed(4));
        value.scaleY = Number(sampleTrack(tracks.scale, time, "y", 1).toFixed(4));
      }
      if (tracks.translate) {
        value.x = Number(sampleTrack(tracks.translate, time, "x", 0).toFixed(4));
        value.y = Number(sampleTrack(tracks.translate, time, "y", 0).toFixed(4));
      }
      sample.bones[boneName] = value;
    }
    samples.push(sample);
  }
  return {
    duration,
    sampleCount,
    interpolation: "smoothstep-between-source-spine-keyframes",
    sourceKeyframes: boneNames,
    samples,
  };
}

const asset = {
  version: 1,
  id: "juju-action-mesh-30",
  source: "juju-poc.json",
  sampleCount,
  frameRateTarget: 60,
  actions: {
    feeding: buildAction("feeding"),
    drinking: buildAction("drinking"),
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(asset, null, 2)}\n`, "utf8");
console.log(`built ${outputPath.pathname}`);
