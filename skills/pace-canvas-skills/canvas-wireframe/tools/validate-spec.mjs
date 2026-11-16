#!/usr/bin/env node
// Validate a wireframe spec without building: every error with a code and a path.   node validate-spec.mjs <spec.json> [--json]
// Exit codes: 0 valid · 1 usage · 2 file unreadable · 3 invalid (not JSON, or errors listed)
import { readBounded } from "../../runtime/io.mjs";

const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const args = process.argv.slice(2);
const json = args.includes("--json");
const pos = args.filter((a) => !a.startsWith("--"));
if (pos.length !== 1 || args.some((a) => a.startsWith("--") && a !== "--json")) die(1, "usage: validate-spec.mjs <spec.json> [--json]");
const core = await import("../../runtime/core.mjs");
let bytes;
try { bytes = await readBounded(pos[0], 10 * 1024 * 1024); } catch (e) { die(2, `error: cannot read ${pos[0]}: ${e.code ?? e.message}`); }
if (!bytes) die(2, "error: the spec is larger than 10 MiB");
let spec;
try { spec = JSON.parse(bytes.toString("utf8")); } catch (e) { die(3, `error: the spec is not JSON: ${e.message}`); }
const errors = core.validateSpec(spec);
if (json) process.stdout.write(JSON.stringify({ errors }, null, 2) + "\n");
else process.stdout.write(errors.length ? errors.map((e) => `${e.code} ${e.path}: ${e.message}`).join("\n") + `\n${errors.length} error(s)\n` : "spec is valid\n");
process.exit(errors.length ? 3 : 0);
