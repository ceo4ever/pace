// Drive an installed Chrome over the DevTools protocol with Node's built-in WebSocket (Node 22+). No npm packages.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export class ChromeError extends Error {}

// Chrome may create the file before its contents are complete or release its Windows lock.
export function readDevtoolsAddress(file, read = readFileSync) {
  try {
    const [port, path] = read(file, "utf8").trim().split(/\r?\n/);
    return /^\d+$/.test(port) && path?.startsWith("/devtools/") ? [port, path] : null;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EBUSY") return null;
    throw error;
  }
}

/**
 * What `ps` says about a process: null when it cannot be asked (no `ps`, e.g. Windows, or it failed), "" when it printed nothing.
 * Neither is ever taken as "the process is gone": existence is asked with `process.kill(pid, 0)`, `ps` only adds who it is.
 */
const psField = (field, pid) => {
  try { return execFileSync("ps", ["-o", `${field}=`, "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};
const startOf = (pid) => psField("lstart", pid);
/** The command line names exactly this run's throwaway profile as its --user-data-dir (an argument of its own, not a part of a longer text). */
/** The command line carries this run's own owner mark: a random 128-bit value no other process has, so a reused pid can never look like our Chrome (a path or flag text could be ambiguous once `ps` flattens the arguments). */
const carriesOwner = (cmd, token) => typeof cmd === "string" && cmd.includes(`--canvas-skills-owner=${token}`);

// The watcher ends a Chrome only when its command line proves it is THIS run's (a pid alone could belong to another process after reuse), keeps asking while that
// cannot be asked, and always leaves: when the parent is still there and the profile exists it waits, otherwise it cleans up and exits (after ~10 s of not being able to tell).
const REAPER = `const [ppid, pstart, cpid, profile, token] = process.argv.slice(1); const fs = require("fs"); const { execFileSync } = require("child_process");
const ps = (field, p) => { try { return execFileSync("ps", ["-o", field + "=", "-p", String(p)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const aliveByPid = (p) => { try { process.kill(+p, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const carries = (cmd) => typeof cmd === "string" && cmd.includes("--canvas-skills-owner=" + token);
// gone = its pid is free, or the pid now belongs to a process that started at another time (only a real, different start time says so; a failed or empty answer does not)
const parentGone = () => { if (!aliveByPid(ppid)) return true; if (!pstart) return false; const now = ps("lstart", ppid); return !!now && now !== pstart; };
let unsure = 0;
setInterval(() => {
  if (!fs.existsSync(profile)) process.exit(0);
  if (!parentGone()) return;
  if (aliveByPid(cpid)) {
    const cmd = ps("command", cpid);
    if (carries(cmd)) { try { process.kill(-cpid, "SIGKILL"); } catch { try { process.kill(+cpid, "SIGKILL"); } catch {} } }
    else if (cmd === null || cmd === "") { if (++unsure < 25) return; } // cannot tell who it is: ask again, and give up (touching nothing) after ~10 s
    else { /* another process owns that pid now: Chrome itself is long gone */ }
  }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
}, 400);`;

export function findChrome(env = process.env) {
  // A CHROME_PATH that is set is the only candidate: a wrong path must fail, not quietly use another browser.
  if (env.CHROME_PATH) {
    if (!existsSync(env.CHROME_PATH)) throw new ChromeError(`CHROME_PATH=${env.CHROME_PATH} does not exist. Unset it to use an installed Chrome, or point it to Chrome's executable.`);
    return env.CHROME_PATH;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new ChromeError(`Chrome not found. Install Google Chrome or set CHROME_PATH to its executable.`);
  return found;
}

/** Start headless Chrome with its own temporary profile and no network except loopback; returns a small page driver. */
export async function launchChrome({ chromePath = findChrome(), width = 1600, height = 900, timeoutMs = 30000 } = {}) {
  if (typeof WebSocket === "undefined") throw new ChromeError("This Node has no built-in WebSocket; use Node 22 or newer.");
  const profile = mkdtempSync(join(tmpdir(), "canvas-tools-chrome-"));
  const owner = randomBytes(16).toString("hex");
  const proc = spawn(chromePath, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--use-mock-keychain", "--password-store=basic", `--canvas-skills-owner=${owner}`, // no macOS keychain dialog for a throwaway profile
        "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", `--window-size=${width},${height}`, "about:blank",
  ], { stdio: "ignore", cwd: dirname(process.execPath), detached: process.platform !== "win32" }); // its own process group, so Chrome's helper processes go with it
  let cleaned = false;
  const stop = () => {
    if (cleaned) return; cleaned = true;
    // Chrome and its helpers (the whole process group) go together. While Node has not yet seen this child end, its pid cannot belong to anyone else; if `ps` can say whose
    // command line sits under it and it is not ours, the group is left alone and only the handle's own kill is used.
    const cmd = process.platform === "win32" || !proc.pid ? null : psField("command", proc.pid);
    const stillOurs = proc.exitCode === null && proc.signalCode === null && (cmd === null || carriesOwner(cmd, owner));
    try { if (stillOurs && process.platform !== "win32" && proc.pid) process.kill(-proc.pid, "SIGKILL"); else proc.kill("SIGKILL"); } catch { try { proc.kill("SIGKILL"); } catch {} }
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  // a normal exit, an error, Ctrl-C or a SIGTERM/SIGHUP from outside takes Chrome and its profile folder with it. A SIGKILL of this process cannot be caught: the watcher below covers it (on Windows only the Chrome parent process is ended).
  const bySignal = (sig) => () => { stop(); process.kill(process.pid, sig); };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"].map((sig) => [sig, bySignal(sig)]);
  process.on("exit", stop);
  for (const [sig, h] of signals) process.once(sig, h);
  // a SIGKILL of this process cannot be caught: a tiny watcher (its own process) ends Chrome and removes the profile within a second of this process dying, and leaves by itself once the profile is gone
  try { const r = spawn(process.execPath, ["-e", REAPER, String(process.pid), startOf(process.pid) ?? "", String(proc.pid), profile, owner], { stdio: "ignore", cwd: dirname(process.execPath), detached: true, windowsHide: true }); r.on("error", () => {}); r.unref(); } catch { /* without the watcher the other paths still clean up */ }
  const cleanup = () => { stop(); process.off("exit", stop); for (const [sig, h] of signals) process.off(sig, h); };
  let spawnError = null;
  proc.on("error", (e) => { spawnError = e; });
  try {
    const portFile = join(profile, "DevToolsActivePort");
    const t0 = Date.now();
    let address;
    while (!(address = readDevtoolsAddress(portFile))) {
      if (spawnError) throw new ChromeError(`could not start Chrome: ${spawnError.message}`);
      if (proc.exitCode !== null) throw new ChromeError(`Chrome exited at start (code ${proc.exitCode})`);
      if (Date.now() - t0 > timeoutMs) throw new ChromeError("Chrome did not start in time");
      await new Promise((r) => setTimeout(r, 50));
    }
    const [port, path] = address;
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new ChromeError("could not connect to Chrome")); });
    let id = 0;
    const allowed = ["data:", "blob:", "about:"];
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Fetch.requestPaused") {
        const { requestId, request } = m.params;
        const ok = allowed.some((a) => request.url.startsWith(a));
        send(ok ? "Fetch.continueRequest" : "Fetch.failRequest", ok ? { requestId } : { requestId, errorReason: "BlockedByClient" }, m.sessionId).catch(() => {});
        return;
      }
      const p = m.id && pending.get(m.id);
      if (p) { pending.delete(m.id); if (m.error) p.rej(new ChromeError(m.error.message)); else p.res(m.result); }
    };
    ws.onclose = () => { for (const p of pending.values()) p.rej(new ChromeError("Chrome closed the connection")); pending.clear(); };
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    return {
      /** Only requests to these URL prefixes (plus data:/blob:/about:) go out; everything else, loopback ports included, fails. */
      allowOnly: async (...prefixes) => { allowed.push(...prefixes); await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId); },
      goto: async (url) => { await send("Page.navigate", { url }, sessionId); },
      /** Evaluate `expression` (may return a promise) and return its JSON value; page exceptions become ChromeError. */
      evaluate: async (expression, { timeout = 120000 } = {}) => {
        let timer;
        const r = await Promise.race([
          send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
          new Promise((_, rej) => { timer = setTimeout(() => rej(new ChromeError(`page did not answer within ${timeout} ms`)), timeout); }),
        ]).finally(() => clearTimeout(timer)); // a pending timer would keep the process alive until it fires
        if (r.exceptionDetails) throw new ChromeError(r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text);
        return r.result.value;
      },
      close: () => { try { ws.close(); } catch {} cleanup(); },
    };
  } catch (e) { cleanup(); throw e; }
}
