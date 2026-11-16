#!/usr/bin/env node
// Recompute text heights and auto layout with the editor's own engine, let boards follow their content, and write the result as a NEW file (the original is never changed).
//   node normalize.mjs <file.canvas.json> --out <new.canvas.json> [--timeout SECONDS]
// Exit codes: 0 ok · 1 usage · 2 file unreadable/over 100 MiB or output exists · 3 invalid document · 5 Chrome missing · 6 normalize failed
import { resolve } from "node:path";
import { ChromeError } from "../../runtime/chrome.mjs";
import { exists, publishNew, readBounded } from "../../runtime/io.mjs";

const USAGE = "usage: normalize.mjs <file.canvas.json> --out <new.canvas.json> [--timeout SECONDS]";
const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const argv = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--out" || a === "--timeout") { const v = argv[++i]; if (v === undefined) die(1, `${a} needs a value`); flags[a.slice(2)] = v; }
  else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  else if (a.startsWith("--")) die(1, `error: unknown option ${a}\n${USAGE}`);
  else pos.push(a);
}
if (pos.length !== 1 || !flags.out) die(1, USAGE);
const timeoutMs = Math.round((flags.timeout === undefined ? 300 : Number(flags.timeout)) * 1000);
if (!(timeoutMs > 0 && timeoutMs <= 3600000)) die(1, "--timeout must be above 0 and at most 3600 seconds");
const core = await import("../../runtime/core.mjs");
let bytes;
try { bytes = await readBounded(pos[0], core.MAX_FILE_BYTES); } catch (e) { die(2, `error: cannot read ${pos[0]}: ${e.code ?? e.message}`); }
if (!bytes) die(2, "error: the file is larger than 100 MiB");
try { core.parseDocFile(bytes.toString("utf8")); } catch (e) { die(3, `error: invalid document: ${e.message}`); }
const out = resolve(flags.out);
if (await exists(out)) die(2, `error: ${out} already exists; write a new file`);
try {
  const { normalizeText } = await import("../../runtime/normalize.mjs");
  // normalize → boards follow the real heights → normalize (markers are not moved here: they are placed when a wireframe is made)
  const follow = (t) => { const p = core.parseDocFile(t); core.relayoutBoards(p.doc); return JSON.stringify(core.buildDocFile(p.doc, p.images)); };
  let text = await normalizeText(bytes.toString("utf8"), { timeoutMs });
  text = follow(await normalizeText(follow(text), { timeoutMs }));
  try { await publishNew(out, text); } catch (e) { die(2, `error: cannot write ${out}: ${e.code ?? e.message} (it must not exist yet)`); }
  process.stdout.write(`${out}\n`);
  process.exit(0);
} catch (e) {
  if (e instanceof ChromeError) die(/not found|CHROME_PATH|could not start|exited at start/.test(e.message) ? 5 : 6, `error: normalize failed: ${e.message}`);
  throw e;
}
