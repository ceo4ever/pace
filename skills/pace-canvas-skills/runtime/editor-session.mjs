// A headless Chrome with the bundle's editor open on one document, for tools that need the editor's own engine (normalize, render).
// The editor is served from runtime/app on a random loopback port; Chrome may reach only that server. The document goes in over that server too.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ChromeError, launchChrome } from "./chrome.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".txt": "text/plain", ".png": "image/png" };

/** Opens the document in the editor and returns `{ page, base, close }`. Throws ChromeError (no Chrome, editor did not start, document refused). */
export async function openEditor(docBytes, { timeoutMs = 300000 } = {}) {
  const root = resolve(here, "app");
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
  const close = () => { page?.close(); server.close(); };
  try {
    page = await launchChrome();
    await page.allowOnly(base);
    await page.goto(base);
    const ready = await page.evaluate(`new Promise((res) => { const t0 = Date.now(); const tick = () => "__render" in window ? res(true) : Date.now() - t0 > 30000 ? res(false) : setTimeout(tick, 50); tick(); })`, { timeout: Math.min(timeoutMs, 40000) });
    if (!ready) throw new ChromeError("the editor did not start");
    const opened = await page.evaluate(`fetch(${JSON.stringify(docPath)}).then((r) => r.text()).then((t) => window.__render.open(t))`, { timeout: timeoutMs });
    if (!opened.ok) throw new ChromeError(`the editor could not open the document: ${opened.error}`);
  } catch (e) { close(); throw e; }
  return { page, base, close };
}
