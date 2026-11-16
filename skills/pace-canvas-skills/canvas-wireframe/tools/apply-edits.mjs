#!/usr/bin/env node
// Apply an approved proposal to a document and write the result as a NEW file. The original is not changed. Only the layers the proposal names change;
// a person's other edits stay. A proposal made for an older state of the document is refused.
//   node apply-edits.mjs <file.canvas.json> <proposal.json> --out <new.canvas.json>
// Exit codes: 0 applied · 1 usage · 2 file unreadable or output exists · 3 invalid document/proposal · 9 stale proposal (the document changed since it was made)
import { resolve } from "node:path";
import { exists, publishNew, readBounded } from "../../runtime/io.mjs";

const USAGE = "usage: apply-edits.mjs <file.canvas.json> <proposal.json> --out <new.canvas.json>";
const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const argv = process.argv.slice(2), pos = [];
let out;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--out") { out = argv[++i]; if (!out) die(1, "--out needs a value"); }
  else if (argv[i] === "--help" || argv[i] === "-h") { console.log(USAGE); process.exit(0); }
  else if (argv[i].startsWith("--")) die(1, `error: unknown option ${argv[i]}\n${USAGE}`);
  else pos.push(argv[i]);
}
if (pos.length !== 2 || !out) die(1, USAGE);
const core = await import("../../runtime/core.mjs");
let docBytes, propBytes;
try { docBytes = await readBounded(pos[0], core.MAX_FILE_BYTES); propBytes = await readBounded(pos[1], 10 * 1024 * 1024); } catch (e) { die(2, `error: cannot read a file: ${e.code ?? e.message}`); }
if (!docBytes || !propBytes) die(2, "error: a file is larger than its limit");
let parsed, proposal;
try { parsed = core.parseDocFile(docBytes.toString("utf8")); } catch (e) { die(3, `error: invalid document: ${e.message}`); }
try { proposal = JSON.parse(propBytes.toString("utf8")); } catch (e) { die(3, `error: the proposal is not JSON: ${e.message}`); }
if (!proposal || proposal.kind !== "proposal" || proposal.tool !== "canvas-wireframe.edit" || !Array.isArray(proposal.changes) || typeof proposal.base !== "string") die(3, "error: not a canvas-wireframe.edit proposal (kind, tool, base, changes)");
out = resolve(out);
if (await exists(out)) die(2, `error: ${out} already exists; write a new file`);
let next;
try { next = core.applyEdits(parsed.doc, proposal.changes, { base: proposal.base }); } catch (e) { die(/changed since/.test(e.message) ? 9 : 3, `error: ${e.message}`); }
// markers are not moved by an edit: they were placed when the wireframe was made
try { await publishNew(out, JSON.stringify(core.buildDocFile(next, parsed.images))); } catch (e) { die(2, `error: cannot write ${out}: ${e.code ?? e.message}`); }
process.stdout.write(`${out}\napplied ${proposal.changes.length} change(s)\n`);
