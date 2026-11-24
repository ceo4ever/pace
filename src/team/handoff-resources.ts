import { HandoffStore } from "../project/handoff-store.ts";
import { openRepo, findProject, statsRepo } from "../project/harness.ts";
import type { AppliedResourceEvent, ResourceEventSink } from "./resource-events.ts";
import { HandoffGuardBusy } from "../project/handoff-files.ts";

export function projectResourceSink(root: string, project: string): ResourceEventSink {
  const repo = openRepo(root), ref = findProject(repo, project), owner = statsRepo(repo, ref);
  const store = new HandoffStore(owner.root, ref.id, `projects/${ref.dir}`);
  return {
    directory: store.bodies.journalDir(),
    onApplied(event: AppliedResourceEvent): void {
      const deadline = Date.now() + 1000;
      for (;;) {
        try {
          store.record({ protocol: "pace-handoff", v: 1, id: `resource-${event.id}`, kind: "resource_event", from: `project:${ref.id}`, to: `project:${ref.id}`, data: { transitionId: event.id, action: event.action, appliedAt: event.at, resource: event.lease.resource, holder: event.lease.by, stateHash: event.stateHash, acquisitionId: event.lease.acquisitionId, ...(event.previousAcquisitionId ? { previousAcquisitionId: event.previousAcquisitionId } : {}) } }, `resource-applied:${event.id}`, true);
          return;
        } catch (error) { if (!(error instanceof HandoffGuardBusy) || Date.now() >= deadline) throw error; }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    },
  };
}
