#!/usr/bin/env node
// Turn a list of wanted changes into a PROPOSAL for an existing document: names resolved to layer ids, every change checked, nothing applied.
//   node edit.mjs <file.canvas.json> <ops.json> [--out <proposal.json>]
// ops.json is a list: {"op":"set","target":<id|{"name":…}>,"fields":{…}} · {"op":"add","parent":…,"content":{…}} · {"op":"remove","target":…} · {"op":"move","target":…,"x"?,"y"?,"parent"?}
// Exit codes: 0 proposal made · 1 usage · 2 file unreadable or output exists · 3 invalid document/ops file, or the changes have problems (listed)
import { resolve } from "node:path";
import { exists, publishNew, readBounded } from "../../runtime/io.mjs";

const USAGE = `usage: edit.mjs <file.canvas.json> <ops.json> [--out <proposal.json>]
ops.json is a list; a target is a layer id or {"name": "..."} (one layer only):
  {"op":"set","target":T,"fields":{"name"|"text"|"x"|"y"|"w"|"h"|"visible"|"opacity": value}}
  {"op":"add","parent":T,"content":{"t":"text"|"frame"|"box", ...}}
  {"op":"move","target":T,"x":N,"y":N,"parent":T}   (x, y, parent each optional)
  {"op":"remove","target":T}
See canvas-wireframe/SKILL.md, "변경 제안의 형식".`;
const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const argv = process.argv.slice(2), pos = [];
let out;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--out") { out = argv[++i]; if (!out) die(1, "--out needs a value"); }
  else if (argv[i] === "--help" || argv[i] === "-h") { console.log(USAGE); process.exit(0); }
  else if (argv[i].startsWith("--")) die(1, `error: unknown option ${argv[i]}\n${USAGE}`);
  else pos.push(argv[i]);
}
if (pos.length !== 2) die(1, USAGE);
const core = await import("../../runtime/core.mjs");
let docBytes, opsBytes;
try { docBytes = await readBounded(pos[0], core.MAX_FILE_BYTES); opsBytes = await readBounded(pos[1], 10 * 1024 * 1024); } catch (e) { die(2, `error: cannot read a file: ${e.code ?? e.message}`); }
if (!docBytes || !opsBytes) die(2, "error: a file is larger than its limit");
let doc, ops;
try { doc = core.parseDocFile(docBytes.toString("utf8")).doc; } catch (e) { die(3, `error: invalid document: ${e.message}`); }
try { ops = JSON.parse(opsBytes.toString("utf8")); } catch (e) { die(3, `error: the ops file is not JSON: ${e.message}`); }
const r = core.resolveEdits(doc, ops);
if (r.errors.length) die(3, r.errors.map((e) => `${e.code} change[${e.index}]: ${e.message}`).join("\n"));
const proposal = { kind: "proposal", skill: "canvas-wireframe", tool: "canvas-wireframe.edit", summary: `${r.ops.length} change(s)`, base: core.fingerprint(doc), changes: r.ops };
const text = JSON.stringify(proposal, null, 2) + "\n";
if (out) {
  out = resolve(out);
  if (await exists(out)) die(2, `error: ${out} already exists; write a new file`);
  try { await publishNew(out, text); } catch (e) { die(2, `error: cannot write ${out}: ${e.code ?? e.message}`); }
  process.stdout.write(`${out}\n${proposal.summary}\n`);
} else process.stdout.write(text);
