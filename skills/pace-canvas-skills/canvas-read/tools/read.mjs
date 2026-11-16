#!/usr/bin/env node
// Read frames and elements of a .canvas.json without a browser (P011 T01). See GUIDE.md.
//   node read.mjs <file> toc  [--depth N] [--max N] [--json]
//   node read.mjs <file> find <name-or-id> [--type T] [--max N] [--json]
//   node read.mjs <file> show <id> [--depth N] [--max N] [--json]
// Exit codes: 0 ok · 1 usage · 2 file unreadable or over 100 MiB · 3 invalid document · 4 id not found

const USAGE = `usage: read.mjs <file.canvas.json> <toc|find|show> [arg] [--depth N] [--max N] [--type T] [--full-text] [--json]`;
const die = (code, msg) => { process.stderr.write(`error: ${msg}\n`); process.exit(code); };

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json" || a === "--full-text") flags[a === "--json" ? "json" : "fullText"] = true;
  else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  else if (a === "--depth" || a === "--max" || a === "--type") {
    const v = argv[++i];
    if (v === undefined) die(1, `${a} needs a value`);
    if (a !== "--type" && !/^\d+$/.test(v)) die(1, `${a} needs a whole number`);
    flags[a.slice(2)] = a === "--type" ? v : Number(v);
  } else if (a.startsWith("--")) die(1, `unknown option ${a}\n${USAGE}`);
  else pos.push(a);
}
const [file, cmd, arg, ...rest] = pos;
if (!file || !["toc", "find", "show"].includes(cmd) || rest.length) die(1, USAGE);
if (cmd !== "toc" && !arg) die(1, `${cmd} needs ${cmd === "find" ? "a name or id" : "a node id"}`);
if (cmd === "toc" && arg) die(1, "toc takes no argument");

const core = await import("../../runtime/core.mjs");
const { readBounded } = await import("../../runtime/io.mjs");
let bytes;
try { bytes = await readBounded(file, core.MAX_FILE_BYTES); } catch (e) { die(2, `cannot read ${file}: ${e.code ?? e.message}`); }
if (!bytes) die(2, `${file} is larger than the limit ${core.MAX_FILE_BYTES} bytes (100 MiB)`);
const text = bytes.toString("utf8");
let opened;
try { opened = core.openForRead(text); } catch (e) { die(3, e instanceof core.DocFileError ? `invalid document: ${e.message}` : `invalid document: ${e.message}`); }

// The same registry the app's AI entry calls: this file only parses the command line and prints.
const registry = core.createSkillRegistry();
const ctx = { open: () => opened };
const opt = (k, v) => (v === undefined || v === false ? {} : { [k]: v });
try {
  let result, textOut;
  if (cmd === "toc") { result = registry.call("canvas-read.toc", ctx, { ...opt("depth", flags.depth), ...opt("max", flags.max) }); textOut = core.renderToc(result); }
  else if (cmd === "find") { result = registry.call("canvas-read.find", ctx, { query: arg, ...opt("type", flags.type), ...opt("max", flags.max) }); textOut = core.renderFind(result); }
  else { result = registry.call("canvas-read.show", ctx, { id: arg, ...opt("depth", flags.depth), ...opt("max", flags.max), ...opt("fullText", flags.fullText) }); textOut = core.renderShow(result); }
  process.stdout.write((flags.json ? JSON.stringify(result, null, 2) : textOut) + "\n");
} catch (e) {
  if (e instanceof core.ReadError) die(e.code === "usage" ? 1 : 4, e.message);
  throw e;
}
