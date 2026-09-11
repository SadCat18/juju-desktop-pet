import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const spineRoot = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(spineRoot, "..");
const androidAssets = path.join(projectRoot, "android-pet", "app", "src", "main", "assets");
const checkOnly = process.argv.includes("--check");

const files = ["app.js", "index.html", "app.css"];
const directories = ["spine"];
const vendorFiles = ["spine-webgl-4.2.120.js"];

if (!checkOnly) {
  fs.rmSync(androidAssets, { recursive: true, force: true });
  fs.mkdirSync(androidAssets, { recursive: true });
}

function sameFile(source, destination) {
  try { return fs.readFileSync(source).equals(fs.readFileSync(destination)); } catch (_error) { return false; }
}

function syncFile(relativeSource, relativeDestination) {
  const source = path.join(spineRoot, relativeSource);
  const destination = path.join(androidAssets, relativeDestination || relativeSource);
  if (checkOnly) {
    if (!sameFile(source, destination)) throw new Error(`Android 资产不同步: ${relativeDestination || relativeSource}`);
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function syncDirectory(relativeSource) {
  const source = path.join(spineRoot, relativeSource);
  const destination = path.join(androidAssets, relativeSource);
  if (checkOnly) {
    const sourceFiles = [];
    const visit = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else sourceFiles.push(path.relative(source, full));
    });
    visit(source);
    sourceFiles.forEach((file) => syncFile(path.join(relativeSource, file), path.join(relativeSource, file)));
    return;
  }
  const pending = [[source, destination]];
  while (pending.length) {
    const [currentSource, currentDestination] = pending.pop();
    fs.mkdirSync(currentDestination, { recursive: true });
    fs.readdirSync(currentSource, { withFileTypes: true }).forEach((entry) => {
      const sourcePath = path.join(currentSource, entry.name);
      const destinationPath = path.join(currentDestination, entry.name);
      if (entry.isDirectory()) pending.push([sourcePath, destinationPath]);
      else fs.copyFileSync(sourcePath, destinationPath);
    });
  }
}

files.forEach((file) => syncFile(file));
directories.forEach(syncDirectory);
vendorFiles.forEach((file) => syncFile(path.join("vendor", file), path.join("vendor", file)));

console.log(checkOnly ? "Android Web 资产同步校验通过" : "Android Web 资产已从 spine-poc 同步");
