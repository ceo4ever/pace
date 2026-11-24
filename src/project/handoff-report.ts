import { existsSync } from "node:fs";
import { join } from "node:path";
import { readEvents, type ProjectEvent } from "./event-log.ts";
import { HandoffStore } from "./handoff-store.ts";
import { regularBytes } from "./handoff-files.ts";
import { safeTeamPath } from "../team/store.ts";

export type Reach = "captain_reply" | "captain_delivery" | "failed_only" | "unconfirmed";
export interface HandoffReport {
  records: number; missingBodies: number; auditCoverage: "local-bytes" | "metadata-only"; open: string[];
  kinds: Record<string, number>; agents: Record<string, Record<string, number>>;
  requests: { total: number; captain_reply: number; captain_delivery: number; failed_only: number; unconfirmed: number; unlinkedLogEvents: number; items: { requestId: string; reach: Reach }[] };
}
function captainAnswer(projectDir: string, event: ProjectEvent): boolean {
  if (event.type !== "answer" || event.by !== "user" || !event.ref) return false;
  try { return regularBytes(safeTeamPath(projectDir, event.ref), 2 * 1024 * 1024).length > 0; } catch { return false; }
}
export function collectHandoffs(root: string, project: string, projectDir: string): HandoffReport | undefined {
  const dir = join(root, projectDir), events = readEvents(dir).filter((e) => e.p === project), ledger = join(dir, "handoffs.jsonl");
  if (!existsSync(ledger) && !events.some((e) => e.requestId)) return undefined;
  const store = new HandoffStore(root, project, projectDir), rows = store.read(), audit = store.audit();
  const kinds: Record<string, number> = {}, agents: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
    if (row.from === "coordinator" || row.from.startsWith("agent:")) { const counts = agents[row.from] ??= {}; counts[row.kind] = (counts[row.kind] ?? 0) + 1; }
  }
  const ids = new Set([...rows.filter((r) => r.kind === "decision_request").map((r) => r.requestId!), ...events.filter((e) => e.requestId && ["question", "escalation"].includes(e.type)).map((e) => e.requestId!)]);
  const requests: HandoffReport["requests"] = { total: ids.size, captain_reply: 0, captain_delivery: 0, failed_only: 0, unconfirmed: 0, unlinkedLogEvents: events.filter((e) => !e.requestId && ["question", "escalation"].includes(e.type)).length, items: [] };
  for (const id of [...ids].sort()) {
    const group = rows.filter((r) => r.requestId === id), logs = events.filter((e) => e.requestId === id);
    const attempts = group.filter((r) => r.kind === "delivery" && r.data.routeActor === "captain");
    let reach: Reach = "unconfirmed";
    if (group.some((r) => r.kind === "decision_reply" && r.from === "captain") || logs.some((e) => captainAnswer(dir, e))) reach = "captain_reply";
    else if (attempts.some((r) => r.data.phase === "sent" && r.data.transport === "external")) reach = "captain_delivery";
    else if (attempts.length && attempts.filter((r) => r.data.phase === "started").every((start) => attempts.some((end) => end.data.attemptId === start.data.attemptId && end.data.phase === "failed")) && attempts.some((r) => r.data.phase === "failed")) reach = "failed_only";
    requests[reach]++; requests.items.push({ requestId: id, reach });
  }
  return { ...audit, kinds, agents, requests };
}
