#!/usr/bin/env node
// Check a wireframe document: layers overlapping, content cut off, text that does not fit, the same number twice on a screen.
//   node check.mjs <file.canvas.json> [--max N] [--json]
// Exit codes: 0 no problems (notes may be listed) · 1 usage · 2 file unreadable or over 100 MiB · 3 invalid document · 7 problems found
import { readBounded } from "../../runtime/io.mjs";

const USAGE = "usage: check.mjs <file.canvas.json> [--max N] [--json]";
const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const argv = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json") flags.json = true;
  else if (a === "--max") { const v = argv[++i]; if (!/^\d+$/.test(v ?? "") || Number(v) < 1) die(1, "--max needs a whole number from 1"); flags.max = Number(v); }
  else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  else if (a.startsWith("--")) die(1, `error: unknown option ${a}\n${USAGE}`);
  else pos.push(a);
}
if (pos.length !== 1) die(1, USAGE);
const core = await import("../../runtime/core.mjs");
let bytes;
try { bytes = await readBounded(pos[0], core.MAX_FILE_BYTES); } catch (e) { die(2, `error: cannot read ${pos[0]}: ${e.code ?? e.message}`); }
if (!bytes) die(2, "error: the file is larger than 100 MiB");
let opened;
try { opened = core.openForRead(bytes.toString("utf8")); } catch (e) { die(3, `error: invalid document: ${e.message}`); }
const registry = core.createSkillRegistry();
const { findings, problems, notes, incomplete } = registry.call("canvas-wireframe.check", { open: () => opened }, flags.max ? { max: flags.max } : {});
// `problems` and `notes` count the whole document (at least that many when `incomplete`); `findings` may be cut to --max (the incomplete notice first, then problems, then notes)
const line = (f) => `${f.severity === "note" ? "note " : ""}${f.code} [${f.id}] ${f.message}`;
const cut = findings.length < problems + notes + (incomplete ? 1 : 0) ? problems + notes + (incomplete ? 1 : 0) - findings.length : 0;
const bad = problems > 0 || incomplete;
const tally = incomplete ? `check INCOMPLETE: at least ${problems} problem(s)` : problems ? `${problems} problem(s)` : "check: no problems";
const outText = flags.json ? JSON.stringify({ findings, problems, notes, incomplete }, null, 2) + "\n" : `${findings.map(line).join("\n")}${findings.length ? "\n" : ""}${cut > 0 ? `… ${cut} more not listed (raise --max)\n` : ""}${tally}${notes ? ` (${notes} note(s))` : ""}\n`;
// exit only after the output was handed over: a pipe takes 64 KiB at a time, and process.exit() right after write() would cut a long list
process.stdout.write(outText, () => process.exit(bad ? 7 : 0));
