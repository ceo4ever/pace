#!/usr/bin/env node
// Wireframe spec → a NEW editable .canvas.json: validate → build → normalize (editor engine) → place markers → normalize → check. See SKILL.md.
//   node wireframe.mjs <spec.json> --out <file.canvas.json> [--no-normalize] [--timeout SECONDS] [--json]
// Exit codes: 0 ok · 1 usage · 2 file unreadable/too large or output exists · 3 invalid spec (codes on stderr) · 5 Chrome missing · 6 normalize failed · 7 document written but check found problems
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ChromeError } from "../../runtime/chrome.mjs";
import { exists, publishNew, readBounded } from "../../runtime/io.mjs";

const USAGE = "usage: wireframe.mjs <spec.json> --out <file.canvas.json> [--no-normalize] [--timeout SECONDS] [--json]";
const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const argv = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--no-normalize" || a === "--json") flags[a.slice(2)] = true;
  else if (a === "--out" || a === "--timeout") { const v = argv[++i]; if (v === undefined) die(1, `${a} needs a value`); flags[a.slice(2)] = v; }
  else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  else if (a.startsWith("--")) die(1, `error: unknown option ${a}\n${USAGE}`);
  else pos.push(a);
}
if (pos.length !== 1 || !flags.out) die(1, USAGE);
const timeoutMs = Math.round((flags.timeout === undefined ? 300 : Number(flags.timeout)) * 1000);
if (!(timeoutMs > 0 && timeoutMs <= 3600000)) die(1, "--timeout must be above 0 and at most 3600 seconds");

const core = await import("../../runtime/core.mjs");
let bytes;
try { bytes = await readBounded(pos[0], 10 * 1024 * 1024); } catch (e) { die(2, `error: cannot read ${pos[0]}: ${e.code ?? e.message}`); }
if (!bytes) die(2, "error: the spec is larger than 10 MiB");
let spec;
try { spec = JSON.parse(bytes.toString("utf8")); } catch (e) { die(3, `error: the spec is not JSON: ${e.message}`); }
const errors = core.validateSpec(spec);
if (errors.length) die(3, errors.map((e) => `${e.code} ${e.path}: ${e.message}`).join("\n"));

const out = resolve(flags.out);
// The output is always a new file. A path that already exists (a human may have edited it) fails fast here and again, atomically, when publishing.
if (await exists(out)) die(2, `error: ${out} already exists; write a new file, never over an edited document`);

// build → (normalize → boards follow the real heights → normalize) → place markers and size boards on the final layout
// Markers are placed here and nowhere else: which layer each one points at is known only to this build (layer ids survive normalize), never stored.
const built = core.buildWireframe(spec);
const finish = (docText) => { const p = core.parseDocFile(docText); core.relayoutBoards(p.doc); core.placeMarkers(p.doc, built.links); return { text: JSON.stringify(core.buildDocFile(p.doc, p.images)), parsed: p }; };
let text = JSON.stringify(core.buildDocFile(built.doc, {}));
if (!flags["no-normalize"]) {
  try {
    const { normalizeText } = await import("../../runtime/normalize.mjs");
    text = await normalizeText(text, { timeoutMs });
    text = await normalizeText(finish(text).text, { timeoutMs });
  } catch (e) {
    if (e instanceof ChromeError) die(/not found|CHROME_PATH|could not start|exited at start/.test(e.message) ? 5 : 6, `error: normalize failed: ${e.message}`);
    throw e;
  }
}
const final = finish(text);
text = final.text;
try { await publishNew(out, text); } catch (e) { die(2, `error: cannot write ${out}: ${e.code ?? e.message} (it must not exist yet)`); }
const report = core.checkReport(final.parsed.doc);
const placement = core.markerIssues(final.parsed.doc, built.links).map((i) => ({ code: i.code, id: i.id, name: final.parsed.doc.nodes[i.id]?.name ?? "", message: i.message })); // numbers with no free place, dashed boxes that cross or touch
const findings = [...core.problemsOf(report.findings), ...placement]; // includes the "limit" notice when the check was cut short (a problem)
const notes = report.findings.filter((f) => f.severity === "note");
const manifest = JSON.parse(await readFile(new URL("../../manifest.json", import.meta.url), "utf8").catch(() => "{}"));
const fileInfo = { sha256: createHash("sha256").update(text).digest("hex"), documentVersion: JSON.parse(text).version, skillsVersion: manifest.skillsVersion ?? null };
const made = Object.values(final.parsed.doc.pages).find((pg) => pg.name === "1 화면")?.children.length ?? 0;
const summary = { file: out, ...fileInfo, normalized: !flags["no-normalize"], screens: made, findings, notes };
const outText = flags.json ? JSON.stringify(summary, null, 2) + "\n" : `${out}\nsha256 ${fileInfo.sha256} · skills ${fileInfo.skillsVersion} · document version ${fileInfo.documentVersion}\n${made} screens (spec: ${spec.boards.length})${flags["no-normalize"] ? " (not normalized: text heights are estimates)" : ""}\n${findings.map((f) => `${f.code} [${f.id}] ${f.message}`).join("\n")}${findings.length ? "\n" : ""}${notes.map((f) => `note ${f.code} [${f.id}] ${f.message}`).join("\n")}${notes.length ? "\n" : ""}${findings.length ? `${findings.length} problem(s): fix the spec and write a new file\n` : "check: no problems\n"}`;
process.stdout.write(outText, () => process.exit(findings.length ? 7 : 0)); // after the output was handed over (a pipe takes 64 KiB at a time)
