import { closeSync, constants, existsSync, fsyncSync, lstatSync, openSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { PrivateHandoffBodies } from "./handoff-private.ts";
import { BODY_LIMIT, digest, HandoffError, LEDGER_LIMIT, regularBytes, strictJson, utf8 } from "./handoff-files.ts";
import { safeTeamPath } from "../team/store.ts";
import { header, stable, type HandoffHeader, type HandoffRecord } from "../team/handoff-model.ts";
import { ready, referenced, requireBodies, validateTransition, type StateContext } from "../team/handoff-state.ts";

export class HandoffStore {
  readonly root: string;
  readonly project: string;
  readonly projectDir: string;
  readonly path: string;
  readonly bodies: PrivateHandoffBodies;
  constructor(root: string, project: string, projectDir: string) {
    this.root = root; this.project = project; this.projectDir = projectDir;
    if (!/^P\d{3}$/.test(project)) throw new HandoffError("프로젝트 ID 오류");
    this.path = safeTeamPath(root, `${projectDir}/handoffs.jsonl`);
    this.bodies = new PrivateHandoffBodies(root, project, projectDir);
  }
  context(live: boolean): StateContext { return { root: this.root, projectDir: this.projectDir, bodies: this.bodies, live }; }
  read(): HandoffRecord[] {
    if (!existsSync(this.path)) return [];
    safeTeamPath(this.root, `${this.projectDir}/handoffs.jsonl`);
    const text = utf8(regularBytes(this.path, LEDGER_LIMIT));
    if (text && !text.endsWith("\n")) throw new HandoffError("소통 원장 마지막 행이 불완전하다; 복구 확인 전 보류");
    const rows: HandoffRecord[] = [], checkedBodies = new Set<string>();
    for (const line of text.split("\n").filter(Boolean)) {
      const row = header(strictJson(line), true, true) as HandoffRecord;
      if (row.p !== this.project || row.seq !== rows.length + 1 || rows.some((r) => r.id === row.id)) throw new HandoffError("소통 원장 순번/프로젝트/중복 ID 손상");
      validateTransition(this.context(false), rows, row);
      // Missing local bodies are an audit limitation; a present corrupted body is an error.
      for (const hash of this.privateHashes([row])) if (!checkedBodies.has(hash)) { this.bodies.read(hash); checkedBodies.add(hash); }
      rows.push(row);
    }
    return rows;
  }
  private append(row: HandoffRecord, writing: () => void): void {
    const path = safeTeamPath(this.root, `${this.projectDir}/handoffs.jsonl`), bytes = Buffer.from(JSON.stringify(row) + "\n");
    if ((existsSync(path) ? lstatSync(path).size : 0) + bytes.length > LEDGER_LIMIT) throw new HandoffError("소통 원장 크기 한도");
    writing();
    const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      let offset = 0;
      while (offset < bytes.length) { const written = writeSync(fd, bytes, offset, bytes.length - offset); if (!written) throw new Error("원장 쓰기 중단"); offset += written; }
      fsyncSync(fd);
    } finally { closeSync(fd); }
  }
  record(input: unknown, body: Buffer | string, internal = false): { record: HandoffRecord; localBodyPath: string; duplicate: boolean } {
    if (typeof body === "string" && !body.isWellFormed()) throw new HandoffError("본문 Unicode 오류");
    const parsed = header(input, internal) as HandoffHeader;
    if (!internal && ["policyAuthor", "policySnapshotHash", "policyPlanId"].some((key) => Object.hasOwn(parsed.data, key))) throw new HandoffError("계획 계약 확인 metadata는 내부에서만 생성한다");
    return this.bodies.locked((writing) => {
      const rows = this.read(), bytes = typeof body === "string" ? Buffer.from(body) : body;
      if (bytes.length > BODY_LIMIT) throw new HandoffError("본문 크기 초과");
      const bodyHash = digest(bytes), row: HandoffRecord = { ...structuredClone(parsed), p: this.project, at: new Date().toISOString(), seq: rows.length + 1, bodyHash, bodyRef: `local:${bodyHash}` };
      const old = rows.find((r) => r.id === row.id);
      if (old) {
        const oldHeader: Record<string, unknown> = { ...old, data: { ...old.data } };
        for (const key of ["p", "at", "seq", "bodyHash", "bodyRef"]) delete oldHeader[key];
        for (const key of ["policyAuthor", "policySnapshotHash", "policyPlanId"]) delete (oldHeader.data as Record<string, unknown>)[key];
        if (old.bodyHash !== bodyHash || stable(oldHeader) !== stable(parsed)) throw new HandoffError("기존 ID를 다른 머리/본문으로 덮어쓸 수 없다");
        const stored = this.bodies.capture(bytes); return { record: old, localBodyPath: stored.path, duplicate: true };
      }
      validateTransition(this.context(true), rows, row);
      const stored = this.bodies.capture(bytes);
      header(row, true, true);
      this.append(row, writing);
      return { record: row, localBodyPath: stored.path, duplicate: false };
    });
  }
  readiness(id: string): { ready: boolean; reason: string } {
    const rows = this.read(), delegate = referenced(rows, id, "delegate");
    try {
      requireBodies(this.context(true), rows, delegate);
      // Current plans must still match the contract captured at registration.
      validateTransition(this.context(true), rows, structuredClone(delegate));
      if (rows.some((r) => r.kind === "close" && r.data.re === id)) return { ready: false, reason: "이미 종결된 위임" };
      return { ready: ready(rows, delegate), reason: ready(rows, delegate) ? "수신자 범위 확인 기록 있음" : "수신자 범위 대조 없음/hold" };
    } catch (error) { if (error instanceof HandoffError) return { ready: false, reason: error.message }; throw error; }
  }
  audit(): { records: number; missingBodies: number; auditCoverage: "local-bytes" | "metadata-only"; open: string[] } {
    const rows = this.read(), missingBodies = this.privateHashes(rows).filter((hash) => !this.bodies.read(hash)).length;
    return { records: rows.length, missingBodies, auditCoverage: missingBodies ? "metadata-only" : "local-bytes", open: rows.filter((r) => r.kind === "delegate" && !rows.some((c) => c.kind === "close" && c.data.re === r.id)).map((r) => r.id) };
  }
  private privateHashes(rows: HandoffRecord[]): string[] {
    return [...new Set(rows.flatMap((r) => [r.bodyHash, r.data.policySnapshotHash, r.data.payloadHash].filter((h): h is string => typeof h === "string")))];
  }
}
