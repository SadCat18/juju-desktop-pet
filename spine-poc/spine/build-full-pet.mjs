import fs from "node:fs";

const root = new URL(".", import.meta.url);
const cellWidth = 192;
const cellHeight = 208;
const spritesheetPage = "spritesheet-clean.png";

const rows = [
  ["idle", 0, 6],
  ["running-right", 1, 8],
  ["running-left", 2, 8],
  ["handshake", 3, 4],
  ["jumping", 4, 5],
  ["sleeping", 5, 8],
  ["waiting", 6, 6],
  ["playing", 7, 6],
  ["cleaning", 8, 6],
  ["look-up", 9, 8],
  ["look-down", 10, 8],
];

const frameNames = new Map(rows.map(([name, row, count]) => [
  name,
  Array.from({ length: count }, (_, frame) => `${name}-${frame}`),
]));

const atlas = [
  spritesheetPage,
  "size: 1536, 2288",
  "format: RGBA8888",
  "filter: Linear, Linear",
  "repeat: none",
];
for (const [name, row, count] of rows) {
  for (let frame = 0; frame < count; frame += 1) {
    atlas.push(
      frameNames.get(name)[frame],
      `bounds: ${frame * cellWidth}, ${row * cellHeight}, ${cellWidth}, ${cellHeight}`,
      "offsets: 0, 0, 192, 208",
      "index: -1",
    );
  }
}

for (const prefix of ["feeding-real", "drinking-real"]) {
  for (let frame = 0; frame < 6; frame += 1) {
    const page = `${prefix}-${frame}.png`;
    atlas.push(
      "",
      page,
      "size: 192, 208",
      "format: RGBA8888",
      "filter: Linear, Linear",
      "repeat: none",
      page.slice(0, -4),
      "bounds: 0, 0, 192, 208",
      "offsets: 0, 0, 192, 208",
      "index: -1",
      "",
    );
  }
}

function region(path, x = 0, y = 0) {
  return { path, x, y, width: cellWidth, height: cellHeight };
}

const attachments = {};
for (const names of frameNames.values()) {
  for (const name of names) attachments[name] = region(name);
}
for (const prefix of ["feeding-real", "drinking-real"]) {
  for (let frame = 0; frame < 6; frame += 1) attachments[`${prefix}-${frame}`] = region(`${prefix}-${frame}`);
}

function attachmentTimeline(names, durations, loop) {
  const timeline = [{ name: names[0] }];
  let time = 0;
  for (let index = 1; index < names.length; index += 1) {
    time += durations[index - 1];
    timeline.push({ time: Number(time.toFixed(3)), name: names[index] });
  }
  time += durations[durations.length - 1] || 0;
  timeline.push({ time: Number(time.toFixed(3)), name: loop ? names[0] : null });
  return timeline;
}

function petAnimation(name, names, durations, loop = false) {
  return { slots: { pet: { attachment: attachmentTimeline(names, durations, loop) } } };
}

const idle = frameNames.get("idle");
const sleeping = frameNames.get("sleeping");
const animations = {
  idle: petAnimation("idle", idle, [0.42, 0.26, 0.26, 0.34, 0.34, 0.62], true),
  waiting: petAnimation("waiting", frameNames.get("waiting"), [0.8, 0.8, 0.8, 0.8, 0.8, 1.4], true),
  petting: petAnimation("petting", frameNames.get("cleaning"), [0.48, 0.55, 0.65, 0.55, 0.48, 0.65], false),
  handshake: petAnimation("handshake", [
    frameNames.get("handshake")[0],
    frameNames.get("handshake")[1],
    frameNames.get("handshake")[2],
    frameNames.get("handshake")[2],
    frameNames.get("handshake")[2],
    frameNames.get("handshake")[1],
    frameNames.get("handshake")[0],
  ], [0.65, 0.75, 0.9, 0.9, 0.75, 0.65, 0.9], false),
  playing: petAnimation("playing", frameNames.get("playing"), [0.42, 0.42, 0.48, 0.48, 0.52, 0.68], false),
  sleeping: petAnimation("sleeping", [
    ...sleeping,
    sleeping[6], sleeping[5], sleeping[4], sleeping[3], sleeping[2], sleeping[1],
  ], [0.45, 0.55, 0.6, 0.65, 0.7, 0.75, 0.85, 0.9, 0.85, 0.75, 0.7, 0.65, 0.6, 0.55], true),
  cleaning: petAnimation("cleaning", frameNames.get("handshake"), [0.5, 0.65, 0.85, 0.65], false),
  running: petAnimation("running", frameNames.get("running-right"), [0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.42], true),
  review: petAnimation("review", frameNames.get("cleaning"), [0.7, 0.7, 0.7, 0.7, 0.7, 1.4], true),
  failed: petAnimation("failed", sleeping, [0.55, 0.55, 0.65, 0.7, 0.75, 0.8, 0.85, 1], true),
  feeding: {
    slots: {
      pet: { attachment: [{ name: null }] },
      "real-action": { attachment: [
        { name: null },
        { time: 0.12, name: "feeding-real-0" },
        { time: 0.85, name: "feeding-real-1" },
        { time: 1.58, name: "feeding-real-2" },
        { time: 2.31, name: "feeding-real-3" },
        { time: 3.04, name: "feeding-real-4" },
        { time: 3.77, name: "feeding-real-5" },
        { time: 4.85, name: null },
      ] },
    },
  },
  drinking: {
    slots: {
      pet: { attachment: [{ name: null }] },
      "real-action": { attachment: [
        { name: null },
        { time: 0.12, name: "drinking-real-0" },
        { time: 0.85, name: "drinking-real-1" },
        { time: 1.58, name: "drinking-real-2" },
        { time: 2.31, name: "drinking-real-3" },
        { time: 3.04, name: "drinking-real-4" },
        { time: 3.77, name: "drinking-real-5" },
        { time: 4.85, name: null },
      ] },
    },
  },
};

const json = {
  skeleton: { hash: "juju-full-pose", spine: "4.2.120" },
  bones: [{ name: "root" }],
  slots: [
    { name: "pet", bone: "root", attachment: "idle-0" },
    { name: "real-action", bone: "root", attachment: null },
    { name: "real-action-next", bone: "root", attachment: null },
  ],
  skins: [{ name: "default", attachments: {
    pet: attachments,
    "real-action": attachments,
    "real-action-next": attachments,
  } }],
  animations,
};

fs.writeFileSync(new URL("full-pet.atlas", root), `${atlas.join("\n")}\n`, "utf8");
fs.writeFileSync(new URL("full-pet.json", root), `${JSON.stringify(json, null, 2)}\n`, "utf8");
console.log("built full-pet.atlas and full-pet.json");
