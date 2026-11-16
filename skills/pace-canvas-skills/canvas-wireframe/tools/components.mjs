#!/usr/bin/env node
// List the design-kit parts a wireframe spec can use (`{"t":"use","kit":…,"component":…}`): each kit's version, parts, variant properties and values, text/boolean properties.
//   node components.mjs [--kit <id>] [--find <text>] [--json]
// Kits: basic-kit, opal-backoffice, studio-shell (the Canvas Studio app frame). Exit codes: 0 ok · 1 usage
const die = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const argv = process.argv.slice(2), flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json") flags.json = true;
  else if (a === "--kit" || a === "--find") { const v = argv[++i]; if (v === undefined) die(1, `${a} needs a value`); flags[a.slice(2)] = v; }
  else if (a === "--help" || a === "-h") { console.log("usage: components.mjs [--kit <id>] [--find <text>] [--json]"); process.exit(0); }
  else die(1, `error: unknown argument ${a}\nusage: components.mjs [--kit <id>] [--find <text>] [--json]`);
}
const core = await import("../../runtime/core.mjs");
const registry = core.createSkillRegistry();
const { kits } = registry.call("canvas-wireframe.components", { open: () => { throw new Error("not needed"); } }, { ...(flags.kit ? { kit: flags.kit } : {}), ...(flags.find ? { find: flags.find } : {}) });
if (flags.kit && !kits.length) die(1, `error: no kit "${flags.kit}"`);
const text = flags.json ? JSON.stringify({ kits }, null, 2) + "\n" : kits.map((k) => `# ${k.kit} ${k.version} — ${k.parts.length} part(s)\n${k.parts.map((p) => `${p.name}${p.variants.length ? `\n    variant: ${p.variants.map((v) => `${v.name}=${v.values.join("|")}`).join("  ")}` : ""}${p.props.length ? `\n    props: ${p.props.map((x) => `${x.name} (${x.type})`).join(", ")}` : ""}`).join("\n")}`).join("\n\n") + "\n";
process.stdout.write(text, () => process.exit(0));
