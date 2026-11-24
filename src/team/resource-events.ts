import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTeamFile, safeTeamPath } from "./store.ts";
import type { ResourceLease } from "./resource-lock.ts";

export interface AppliedResourceEvent { version: 1; id: string; action: "acquire" | "release" | "reclaim"; at: number; stateHash: string; stateName: string; lease: ResourceLease; previousAcquisitionId?: string }
export interface ResourceEventSink { directory: string; onApplied: (event: AppliedResourceEvent) => void }
export const leaseHash = (lease: ResourceLease): string => createHash("sha256").update(JSON.stringify(lease)).digest("hex");
function durable(root: string, name: string, value: unknown): void {
  const path = safeTeamPath(root, name), fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
}
export function prepareResourceEvent(sink: ResourceEventSink, action: AppliedResourceEvent["action"], lease: ResourceLease, stateName: string, at: number, previousAcquisitionId?: string): AppliedResourceEvent {
  mkdirSync(sink.directory, { recursive: true, mode: 0o700 });
  const id = `transition-${randomUUID()}`; lease.transitionId = id;
  const event: AppliedResourceEvent = { version: 1, id, action, at, stateHash: leaseHash(lease), stateName, lease: structuredClone(lease), ...(previousAcquisitionId ? { previousAcquisitionId } : {}) };
  durable(sink.directory, `${id}.intent.json`, event);
  return event;
}
export function appliedResourceEvent(sink: ResourceEventSink, event: AppliedResourceEvent): void {
  durable(sink.directory, `${event.id}.applied.json`, event);
  sink.onApplied(event);
}
/** A persisted applied receipt proves the producer passed its successful state write. An intent alone must still match actual state. */
export function reconcileResourceEvents(sink: ResourceEventSink, stateDir: string, stateName: string): { reconciled: number; unconfirmed: string[] } {
  if (!existsSync(sink.directory)) return { reconciled: 0, unconfirmed: [] };
  let count = 0; const unconfirmed: string[] = [];
  for (const name of readdirSync(sink.directory).filter((n) => /^transition-[a-f0-9-]+\.intent\.json$/.test(n)).sort()) {
    const text = readTeamFile(sink.directory, name); if (!text) throw new Error("자원 intent 읽기 실패");
    const event = JSON.parse(text) as AppliedResourceEvent;
    if (event.version !== 1 || event.stateName !== stateName) continue;
    if (name !== `${event.id}.intent.json` || !["acquire", "release", "reclaim"].includes(event.action) || !event.lease || event.lease.transitionId !== event.id || leaseHash(event.lease) !== event.stateHash || event.stateName !== `${event.lease.resource}.json`) throw new Error("자원 intent 손상");
    const appliedName = `${event.id}.applied.json`, applied = readTeamFile(sink.directory, appliedName);
    if (applied !== null) { if (applied !== text) throw new Error("자원 applied/intent 불일치"); }
    else {
      const currentText = readTeamFile(stateDir, stateName), current = currentText ? JSON.parse(currentText) as ResourceLease : null;
      if (!current || current.transitionId !== event.id || leaseHash(current) !== event.stateHash) { unconfirmed.push(event.id); continue; }
      durable(sink.directory, appliedName, event);
    }
    sink.onApplied(event); count++;
  }
  return { reconciled: count, unconfirmed };
}
