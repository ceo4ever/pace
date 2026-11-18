export type Item = { name: string; result: string; kind?: string; durationMs?: number };
export type Totals = Record<string, number>;
const keys = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"] as const;

/** Completeness is distinct from success: a complete failing/skip run is still rejected by the caller. */
export function checkInventory(totals: Totals, inventory: Item[]) {
  const problems: string[] = [];
  const observed: Totals = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const key of keys) if (!Number.isSafeInteger(totals[key]) || totals[key]! < 0) problems.push(`missing/invalid total: ${key}`);
  if (!(totals.tests! > 0)) problems.push("no executed tests");
  if (keys.slice(2).reduce((sum, key) => sum + (totals[key] ?? 0), 0) !== totals.tests) problems.push("outcome total does not equal tests");
  for (const item of inventory) {
    if (typeof item.name !== "string" || !item.name) problems.push("missing test name");
    if (item.kind === "suite") { observed.suites!++; continue; }
    if (item.kind && item.kind !== "test") problems.push(`unknown item kind: ${item.kind}`);
    observed.tests!++;
    const key = ({ pass: "pass", fail: "fail", skip: "skipped", todo: "todo", cancelled: "cancelled" } as Record<string, string>)[item.result];
    if (!key) problems.push(`unknown outcome: ${item.result}`);
    else observed[key]!++;
  }
  for (const key of keys) if (observed[key] !== totals[key]) problems.push(`inventory ${key}: observed ${observed[key]}, summary ${totals[key]}`);
  if (inventory.length !== (totals.tests ?? 0) + (totals.suites ?? 0)) problems.push("inventory cardinality mismatch");
  return { complete: problems.length === 0, problems, observed };
}

/** The P004 default spec/TAP baseline has suites=0; ambiguous suite text is rejected, never guessed. */
export function parseText(text: string) {
  text = text.replace(/\x1b\[[0-9;]*m/g, "");
  const totals: Totals = {};
  for (const key of [...keys, "duration_ms"]) {
    const matches = [...text.matchAll(new RegExp(`^[#ℹ] ${key} ([\\d.]+)\\s*$`, "gm"))];
    if (matches.length) totals[key] = Number(matches.at(-1)![1]);
  }
  // Spec's failing-tests footer repeats case rows after the aggregate summary.
  const cases = text.split(/^[#ℹ] tests \d+\s*$/m)[0]!;
  const inventory: Item[] = [];
  for (const line of cases.split(/\r?\n/)) {
    const spec = line.match(/^\s*([✔✖﹣]) (.*) \(([\d.]+)ms\)(.*)$/);
    if (spec) inventory.push({ name: spec[2]!, result: /#\s*TODO\b/.test(spec[4]!) ? "todo" : spec[1] === "﹣" || /#\s*SKIP\b/.test(spec[4]!) ? "skip" : spec[1] === "✔" ? "pass" : "fail", durationMs: Number(spec[3]) });
    const tap = line.match(/^\s*(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO).*)?$/);
    if (tap) inventory.push({ name: tap[2]!, result: tap[3] === "SKIP" ? "skip" : tap[3] === "TODO" ? "todo" : tap[1] === "ok" ? "pass" : "fail" });
  }
  const checked = checkInventory(totals, inventory);
  const problems = [...checked.problems];
  if (totals.suites !== 0) problems.push("suite text is ambiguous; require event-based inventory instead");
  if (!Number.isFinite(totals.duration_ms) || totals.duration_ms! < 0) problems.push("missing/invalid duration_ms");
  return { totals, inventory, complete: problems.length === 0, problems, observed: checked.observed };
}

export function parseEventLines(text: string) {
  const events: Record<string, unknown>[] = [];
  const diagnostics: { line: number; text: string; problem: string }[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).type !== "string") throw new Error("not a test event");
      const event = value as Record<string, unknown>;
      if (!["test:pass", "test:fail", "test:summary"].includes(event.type as string)) throw new Error("unknown event type");
      if (event.type === "test:summary") {
        if (!event.counts || typeof event.counts !== "object" || !Number.isFinite(event.duration_ms)) throw new Error("incomplete summary event");
      } else {
        const details = event.details as Record<string, unknown> | undefined;
        if (typeof event.name !== "string" || !event.name || typeof event.file !== "string" || !details || !["test", "suite"].includes(String(details.type)) || !Number.isFinite(details.duration_ms)) throw new Error("incomplete result event");
      }
      events.push(event);
    } catch (error) { diagnostics.push({ line: index + 1, text: line, problem: String(error) }); }
  }
  return { events, diagnostics };
}

export function compareItems(left: Item[], right: Item[]) {
  const counts = (items: Item[]) => {
    const result = new Map<string, number>();
    for (const item of items) { const key = `${item.result}\t${item.name}`; result.set(key, (result.get(key) ?? 0) + 1); }
    return result;
  };
  const a = counts(left), b = counts(right);
  return [...new Set([...a.keys(), ...b.keys()])].filter((key) => a.get(key) !== b.get(key)).map((id) => ({ id, baseline: a.get(id) ?? 0, profile: b.get(id) ?? 0 }));
}

export function profileTotals(counts: Record<string, number> | undefined): Totals {
  return { ...counts, tests: counts?.tests!, suites: counts?.suites!, pass: counts?.passed!, fail: counts?.failed!, cancelled: counts?.cancelled!, skipped: counts?.skipped!, todo: counts?.todo! };
}
