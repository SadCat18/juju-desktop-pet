import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.SPINE_POC_PORT || 8765);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".atlas": "text/plain; charset=utf-8",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
    const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const filePath = normalize(join(root, relative));
    if (!filePath.startsWith(root)) throw new Error("forbidden");
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`啾啾 Spine GPU POC: ${url}`);
  if (process.argv.includes("--open")) {
    spawn("powershell.exe", ["-NoProfile", "-Command", `Start-Process '${url}'`], { detached: true, stdio: "ignore" }).unref();
  }
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
