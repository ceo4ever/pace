#!/usr/bin/env node
// Render a frame or element of a .canvas.json to PNG (and SVG) with the editor's own drawing code, in an installed Chrome. See GUIDE.md.
//   node render.mjs <file.canvas.json> <id> [--scale N] [--out DIR] [--svg] [--json]
// Writes <DIR>/<id>.png (+ .svg) and <DIR>/<id>.render.json (origin, scale, pixel size, warnings). Default scale 2, DIR ./render-out.
// Exit codes: 0 ok · 1 usage · 2 file unreadable or over 100 MiB · 3 invalid document · 4 id not found · 5 Chrome missing or failed to start · 6 render failed
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ChromeError, launchChrome } from "../../runtime/chrome.mjs";
import { readBounded, writeSafe } from "../../runtime/io.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const USAGE = "usage: render.mjs <file.canvas.json> <id> [--scale N] [--out DIR] [--svg] [--json] [--timeout SECONDS]";
const die = (code, msg) => { process.stderr.write(`error: ${msg}\n`); process.exit(code); };

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--svg" || a === "--json") flags[a.slice(2)] = true;
  else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  else if (a === "--scale" || a === "--out" || a === "--timeout") { const v = argv[++i]; if (v === undefined) die(1, `${a} needs a value`); flags[a.slice(2)] = v; }
  else if (a.startsWith("--")) die(1, `unknown option ${a}\n${USAGE}`);
  else pos.push(a);
}
const [file, id, ...rest] = pos;
if (!file || !id || rest.length) die(1, USAGE);
const scale = flags.scale === undefined ? 2 : Number(flags.scale);
if (!(scale > 0 && scale <= 8)) die(1, "--scale must be above 0 and at most 8");
const outDir = resolve(flags.out ?? "render-out");
const timeoutSec = flags.timeout === undefined ? 300 : Number(flags.timeout);
if (!(timeoutSec > 0 && timeoutSec <= 3600)) die(1, "--timeout must be above 0 and at most 3600 seconds");
const ms = Math.round(timeoutSec * 1000);

// Parse first: bad file / wrong id never need Chrome.
const core = await import("../../runtime/core.mjs");
const docBytes = await readBounded(file, core.MAX_FILE_BYTES).catch((e) => die(2, `cannot read ${file}: ${e.code ?? e.message}`));
if (!docBytes) die(2, `${file} is larger than the limit ${core.MAX_FILE_BYTES} bytes (100 MiB)`);
let opened;
try { opened = core.openForRead(docBytes.toString("utf8")); } catch (e) { die(3, `invalid document: ${e.message}`); }
if (!Object.hasOwn(opened.doc.nodes, id)) die(4, `no node with id ${id}`);
const manifest = JSON.parse(await readFile(join(here, "../../manifest.json"), "utf8").catch(() => "{}"));

// Loopback server: the editor's static files and this one document, nothing else.
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".txt": "text/plain", ".png": "image/png" };
const root = resolve(here, "../../runtime/app");
const docPath = `/__doc-${randomBytes(8).toString("hex")}.json`;
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === docPath) return void res.writeHead(200, { "content-type": "application/json" }).end(docBytes);
    if (p.endsWith("/")) p += "index.html";
    const f = resolve(root, `.${p}`);
    if (f !== root && !f.startsWith(root + sep)) return void res.writeHead(403).end();
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(await readFile(f));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

let page;
let code = 0;
try {
  const stop = () => { page?.close(); server.close(); process.exit(130); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try { page = await launchChrome(); } catch (e) { server.close(); die(5, e instanceof ChromeError ? e.message : String(e)); }
  await page.allowOnly(base);
  await page.goto(base);
  const ready = await page.evaluate(`new Promise((res) => { const t0 = Date.now(); const tick = () => "__render" in window ? res(true) : Date.now() - t0 > 30000 ? res(false) : setTimeout(tick, 50); tick(); })`, { timeout: Math.min(ms, 40000) });
  if (!ready) throw new ChromeError("the editor did not start");
  const opened2 = await page.evaluate(`fetch(${JSON.stringify(docPath)}).then((r) => r.text()).then((t) => window.__render.open(t))`, { timeout: ms });
  if (!opened2.ok) throw new ChromeError(`the editor could not open the document: ${opened2.error}`);
  const r = await page.evaluate(`window.__render.render(${JSON.stringify(id)}, { scale: ${scale}, svg: ${flags.svg ? "true" : "false"} })`, { timeout: ms });
  await mkdir(outDir, { recursive: true });
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "_");
  const stem = safe === id ? id : `${safe}-${createHash("sha256").update(id).digest("hex").slice(0, 6)}`; // ids that differ only in punctuation never share a file
  const pngFile = join(outDir, `${stem}.png`);
  await writeSafe(pngFile, Buffer.from(r.png.split(",")[1], "base64"));
  const svgFile = r.svg ? join(outDir, `${stem}.svg`) : null;
  if (svgFile) await writeSafe(svgFile, r.svg);
  const rotated = r.node.rotation % 360 !== 0;
  const info = {
    tool: "canvas-read render", skillsVersion: manifest.skillsVersion ?? null,
    node: { id, name: r.node.name, w: r.node.w, h: r.node.h, pageX: r.node.x, pageY: r.node.y, rotation: r.node.rotation },
    scale, pixels: r.pixels,
    /** Page-space box the picture covers (effects included). */
    box: r.box,
    /** Picture top-left relative to the node's top-left, in the units `read.mjs show <id>` uses (valid when rotation is 0). */
    imageOrigin: { x: Math.round((r.box.x - r.node.x) * 100) / 100, y: Math.round((r.box.y - r.node.y) * 100) / 100 },
    mapping: rotated ? "node is rotated: map by the page-space box (box.x/box.y are page coordinates, picture is axis-aligned in the page)" : "pixel = (x - imageOrigin.x, y - imageOrigin.y) * scale, with x,y as printed by read.mjs show <id>",
    files: { png: pngFile, ...(svgFile ? { svg: svgFile } : {}) },
    warnings: r.warnings,
  };
  const infoFile = join(outDir, `${stem}.render.json`);
  await writeSafe(infoFile, JSON.stringify(info, null, 2) + "\n");
  if (flags.json) process.stdout.write(JSON.stringify(info, null, 2) + "\n");
  else process.stdout.write(`${pngFile}\n${infoFile}\n${r.warnings.map((w) => `warning: ${w}`).join("\n")}${r.warnings.length ? "\n" : ""}`);
} catch (e) {
  process.stderr.write(`error: render failed: ${e.message}\n`);
  code = 6;
} finally {
  page?.close();
  server.close();
}
process.exit(code);
