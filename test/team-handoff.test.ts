import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, symlinkSync, linkSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { runPace, sessionFreeEnv, spawnTestChild, tempDir } from "./helpers.ts";
import { HandoffStore } from "../src/project/handoff-store.ts";
import { BODY_LIMIT, HEADER_LIMIT, LEDGER_LIMIT, digest, strictJson } from "../src/project/handoff-files.ts";
import { handoffPrivacyIssues, readPrivateInput } from "../src/project/handoff-private.ts";
import { createTeamMember } from "../src/team/store.ts";
import { instructionDigest, proposalDigest, type HandoffHeader, type HandoffPlan, type HandoffRecord } from "../src/team/handoff-model.ts";
import { deliveryReceipt, prepareDelivery, sendDelivery } from "../src/team/handoff-delivery.ts";
import { ResourceLock } from "../src/team/resource-lock.ts";
import { projectResourceSink } from "../src/team/handoff-resources.ts";
import { collectHandoffs } from "../src/project/handoff-report.ts";
import { recordEvent } from "../src/project/event-log.ts";
import { collectStats, recordMetric } from "../src/project/metrics.ts";
import { findProject, openRepo } from "../src/project/harness.ts";
import { once } from "node:events";

function fixture() {
  const root = tempDir("pace-handoff-"), home = tempDir("pace-handoff-home-");
  const env = { ...sessionFreeEnv(), PACE_HOME: home };
  const git = (...args: string[]) => spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.name", "Fixture").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs/README.md"), "# Fixture\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n");
  assert.equal(git("add", "-A").status, 0);
  assert.equal(git("commit", "-qm", "fixture").status, 0);
  const run = (...args: string[]) => runPace(args, { cwd: root, home });
  const created = run("project", "new", "소통 검증"); assert.equal(created.status, 0, created.stderr);
  const dir = join(root, "projects", readdirSync(join(root, "projects")).find((p) => p.startsWith("P001_"))!);
  return { root, home, dir, run, git };
}

test("긴 합성 캡틴 원문은 로컬 bytes로 남고 버전 관리 원장에는 본문이 들어가지 않는다", () => {
  const f = fixture();
  const body = "SYNTHETIC_CAPTAIN_ONLY_LOCAL\r\n가상 업무 지시\r\n".repeat(80);
  const header = join(f.root, "header.json");
  writeFileSync(header, JSON.stringify({ protocol: "pace-handoff", v: 1, id: "input-one", kind: "captain_input", from: "coordinator", to: "project:P001", data: { sourceRef: "fixture:captain-original-one" } }) + "\n");
  const result = runPace(["team", "handoff", "record", "P001", "--file", header, "--body-file", "-"], { cwd: f.root, home: f.home, input: body });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const response = JSON.parse(result.stdout);
  assert.equal(readFileSync(response.localBodyPath, "utf8"), body);
  const ledger = readFileSync(join(f.dir, "handoffs.jsonl"), "utf8");
  assert.doesNotMatch(ledger, /SYNTHETIC_CAPTAIN_ONLY_LOCAL/);
  const event = JSON.parse(ledger.trim());
  assert.equal(event.bodyHash, createHash("sha256").update(body).digest("hex"));
  assert.ok(existsSync(response.localBodyPath));
  assert.equal(f.git("ls-files", "--others", "--exclude-standard").stdout.includes("bodies/"), false);
});

function protocolFixture() {
  const f = fixture();
  createTeamMember(f.root, "maker", "maker"); createTeamMember(f.root, "reviewer", "reviewer");
  const projectDir = relative(f.root, f.dir), store = new HandoffStore(f.root, "P001", projectDir);
  const instruction = "SYNTHETIC_FIXTURE_INSTRUCTION\r\n합성 시험만 수행한다\r\n";
  const p: HandoffPlan = { id: "plan-one", assignee: "agent:maker", decisionOwner: "agent:reviewer", proofScope: "T-1", instructionHash: digest(instruction) };
  const policy = { version: 1, declaredBy: "coordinator", plans: [p] };
  const policyText = JSON.stringify(policy); writeFileSync(join(f.dir, "handoff-plans.json"), policyText);
  const locator = { ref: `${projectDir}/handoff-plans.json`, hash: digest(policyText), planId: p.id };
  const make = (id: string, kind: HandoffHeader["kind"], data: Record<string, unknown>, from = "coordinator", to = "agent:maker", requestId?: string): HandoffHeader => ({ protocol: "pace-handoff", v: 1, id, kind, from, to, ...(requestId ? { requestId } : {}), data });
  const record = (h: HandoffHeader, body = instruction) => store.record(h, body).record;
  const delegate = (id: string, basis: unknown = { kind: "contract", ...locator }) => record(make(id, "delegate", { basis, plan: p }));
  return { ...f, store, instruction, p, locator, make, record, delegate };
}
function cliRecord(f: ReturnType<typeof protocolFixture>, h: HandoffHeader, body = f.instruction): HandoffRecord {
  const path = join(f.dir, "synthetic-header.json"); writeFileSync(path, JSON.stringify(h));
  const result = runPace(["team", "handoff", "record", "P001", "--file", path, "--body-file", "-"], { cwd: f.root, home: f.home, input: body });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout).record;
}

test("input/contract 계획의 본문·판정자·증명 범위 변조와 none basis는 행을 남기지 않는다", () => {
  const f = protocolFixture();
  const original = f.record(f.make("original", "captain_input", { sourceRef: "fixture:captain-original" }));
  const basis = { kind: "input", ref: original.id, hash: original.bodyHash, policy: f.locator };
  f.delegate("input-ok", basis); f.delegate("contract-ok");
  const count = f.store.read().length;
  for (const [name, badBasis, badPlan, body] of [
    ["none", { kind: "none" }, f.p, f.instruction],
    ["input-body", basis, { ...f.p, instructionHash: digest("changed") }, "changed"],
    ["input-owner", basis, { ...f.p, decisionOwner: "captain" }, f.instruction],
    ["contract-hash", { kind: "contract", ...f.locator, hash: "0".repeat(64) }, f.p, f.instruction],
    ["contract-proof", { kind: "contract", ...f.locator }, { ...f.p, proofScope: "T-2" }, f.instruction],
    ["input-no-policy", { kind: "input", ref: original.id, hash: original.bodyHash }, f.p, f.instruction],
    ["input-null-policy", { ...basis, policy: null }, f.p, f.instruction],
    ["input-false-policy", { ...basis, policy: false }, f.p, f.instruction],
    ["input-empty-policy", { ...basis, policy: "" }, f.p, f.instruction],
  ] as const) {
    assert.throws(() => f.record(f.make(name, "delegate", { basis: badBasis, plan: badPlan }), body));
    assert.equal(f.store.read().length, count, name);
  }
  const lease = f.store.read()[1]!;
  assert.equal(lease.data.policyAuthor, "coordinator");
  assert.equal(lease.data.policySnapshotHash, f.locator.hash);
  assert.equal(f.store.readiness("contract-ok").ready, false);
});

test("해석 승인은 특정 제안·본문·판정 계획에 묶이고 정정 뒤 재사용할 수 없다", () => {
  const f = protocolFixture();
  const original = f.record(f.make("original", "captain_input", { sourceRef: "fixture:original" }), "SYNTHETIC_CAPTAIN_RAW");
  const proposal = f.record(f.make("proposal", "decision_request", { interpretation: true, of: original.id, plan: f.p }, "coordinator", "captain", "business-one"));
  const second = f.record(f.make("other-proposal", "decision_request", { interpretation: true, of: original.id, plan: f.p }, "coordinator", "captain", "business-two"));
  const approved = { kind: "approved", ref: proposal.id, approval: "approval", hash: proposalDigest(proposal) };
  assert.throws(() => f.delegate("before-approval", approved));
  const reply = f.make("approval", "decision_reply", { re: proposal.id, decision: "approve", proposalHash: proposalDigest(proposal), sourceRef: "fixture:captain-reply" }, "captain", "coordinator", "business-one");
  assert.throws(() => f.record(reply, ""));
  f.record(reply, "SYNTHETIC_CAPTAIN_APPROVAL_EXACT\r\n승인\r\n");
  const delegated = f.delegate("approved-delegate", approved);
  f.record(f.make("approved-scope", "scope_check", { re: delegated.id, status: "within", basisHash: instructionDigest(delegated), checks: { instruction: true, decisionOwner: true, proofScope: true } }, "agent:maker", "coordinator"));
  assert.equal(f.store.readiness(delegated.id).ready, true);
  assert.throws(() => f.delegate("duplicate-approved", approved));
  assert.throws(() => f.delegate("other-approval", { ...approved, ref: second.id, hash: proposalDigest(second) }));
  assert.throws(() => f.record(f.make("changed-owner", "delegate", { basis: approved, plan: { ...f.p, decisionOwner: "captain" } })));
  f.record(f.make("correction", "decision_reply", { re: proposal.id, decision: "correct", proposalHash: proposalDigest(proposal), sourceRef: "fixture:captain-correction" }, "captain", "coordinator", "business-one"), "SYNTHETIC_CORRECTION");
  assert.throws(() => f.delegate("stale-approval", approved));
  assert.equal(f.store.readiness("approved-delegate").ready, false);
});

test("수신자 범위 확인과 done 증거를 지정 판정자가 확인한 경우만 종결한다", () => {
  const f = protocolFixture(), delegate = f.delegate("work-one");
  const evidence = [{ path: "proof.txt", hash: digest("synthetic-proof") }]; writeFileSync(join(f.root, "proof.txt"), "synthetic-proof");
  const scope = (id: string, status = "within", from = "agent:maker") => f.make(id, "scope_check", { re: delegate.id, status, basisHash: instructionDigest(delegate), checks: { instruction: true, decisionOwner: true, proofScope: true } }, from, "coordinator");
  const result = (id: string, status: string, from = "agent:maker") => f.make(id, "result", { re: delegate.id, status, evidence }, from, "coordinator");
  const close = (id: string, resultId: string, from = "agent:reviewer") => f.make(id, "close", { re: delegate.id, result: resultId, proofScope: "T-1", checked: true }, from, "coordinator");
  assert.throws(() => f.record(scope("wrong-check", "within", "agent:reviewer")));
  assert.throws(() => f.record(result("premature", "done")));
  f.record(scope("hold", "hold")); assert.equal(f.store.readiness(delegate.id).ready, false);
  f.record(result("partial", "partial")); assert.throws(() => f.record(close("partial-close", "partial")));
  f.record(result("blocked", "blocked")); assert.throws(() => f.record(close("blocked-close", "blocked")));
  assert.throws(() => f.record(result("wrong-result", "done", "agent:reviewer")));
  f.record(scope("within")); assert.equal(f.store.readiness(delegate.id).ready, true);
  f.record(result("done", "done"));
  assert.throws(() => f.record(close("wrong-owner", "done", "coordinator")));
  f.record(result("later-blocked", "blocked")); assert.throws(() => f.record(close("stale-done", "done")));
  f.record(result("done-current", "done"));
  writeFileSync(join(f.root, "proof.txt"), "changed-proof"); assert.throws(() => f.record(close("changed-evidence", "done-current")));
  writeFileSync(join(f.root, "proof.txt"), "synthetic-proof"); f.record(close("close", "done-current"));
  assert.deepEqual(f.store.audit().open, []); assert.equal(f.store.readiness(delegate.id).ready, false);
  rmSync(join(f.root, "proof.txt")); mkdirSync(join(f.root, "proof.txt"));
  assert.deepEqual(f.store.audit().open, [], "이후 산출물 변경이 과거의 구조적 metadata 기록을 손상시키지는 않는다");
});

test("전송 시도는 호출 전에 내구 기록되고 sent/불명/잔여 guard는 재발송하지 않는다", () => {
  const f = protocolFixture(); f.record(f.make("question", "decision_request", { interpretation: false }, "coordinator", "captain", "request-one"));
  const route = { transport: "orca", actor: "coordinator", target: "term_fixture", from: "term_sender", sourceRef: "fixture:orca" };
  let calls = 0;
  const result = sendDelivery(f.store, "question", "attempt-one", route, (_route, path) => {
    calls++;
    assert.equal(f.store.read().at(-1)!.data.phase, "started");
    assert.ok(readFileSync(path, "utf8").includes("SYNTHETIC_FIXTURE_INSTRUCTION"));
    return { phase: "sent", responseHash: digest("fixture-receipt"), responseId: "msg_fixture" };
  });
  assert.equal(result.code, 0); assert.equal(calls, 1);
  assert.throws(() => sendDelivery(f.store, "question", "attempt-two", route, () => { calls++; return { phase: "sent" }; }));
  assert.equal(calls, 1);
  assert.throws(() => prepareDelivery(f.store, "question", "fake-human", { ...route, actor: "captain" }));
  f.record(f.make("uncertain", "status", {}));
  assert.equal(sendDelivery(f.store, "uncertain", "attempt-unknown", route, () => ({ phase: "unconfirmed" })).code, 2);
  assert.throws(() => sendDelivery(f.store, "uncertain", "attempt-unknown-next", route, () => { calls++; return { phase: "failed" }; }));
  f.record(f.make("guarded", "status", {})); mkdirSync(join(f.store.bodies.root, "ledger.guard"));
  assert.throws(() => sendDelivery(f.store, "guarded", "guard-attempt", route, () => { calls++; return { phase: "failed" }; }));
  assert.equal(calls, 1);
});

test("실패는 새 시도만 허용하고 성공 뒤 기록 실패는 미확인으로 남긴다", () => {
  const f = protocolFixture(); f.record(f.make("message", "status", {}));
  const route = { transport: "orca", actor: "coordinator", target: "term_fixture", from: "term_sender", sourceRef: "fixture:orca" };
  assert.equal(sendDelivery(f.store, "message", "failed-attempt", route, () => ({ phase: "failed" })).code, 1);
  const result = sendDelivery(f.store, "message", "next-attempt", route, () => {
    mkdirSync(join(f.store.bodies.root, "ledger.guard"));
    return { phase: "sent", responseHash: digest("synthetic-receipt"), responseId: "msg_fixture" };
  });
  assert.deepEqual(result, { phase: "unconfirmed", code: 2, sentMayHaveOccurred: true });
  assert.equal(f.store.read().at(-1)!.data.phase, "started");
});

test("기존 사람 경로 준비는 발송하지 않고 명시한 실제 출처의 영수증만 수락한다", () => {
  const f = protocolFixture(); f.record(f.make("question", "decision_request", { interpretation: false }, "coordinator", "captain", "request-one"));
  const route = { transport: "external", actor: "captain", target: "existing-host-channel", from: "coordinator", sourceRef: "fixture:existing-human-route" };
  prepareDelivery(f.store, "question", "external-one", route);
  assert.throws(() => deliveryReceipt(f.store, "external-one", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef }));
  assert.throws(() => deliveryReceipt(f.store, "external-one", { phase: "sent", reportedBy: "coordinator", sourceRef: "fixture:different-route", responseHash: digest("receipt"), responseId: "fixture-response" }));
  deliveryReceipt(f.store, "external-one", { phase: "unconfirmed", reportedBy: "coordinator", sourceRef: route.sourceRef });
  const receipt = deliveryReceipt(f.store, "external-one", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseHash: digest("receipt"), responseId: "fixture-response" });
  assert.equal(receipt.data.routeActor, "captain");
});

test("로컬 본문 없음은 metadata-only이며 변조·중복 키·미지원 원장은 오류다", () => {
  const f = protocolFixture(); const delegate = f.delegate("work");
  const path = f.store.bodies.path(delegate.bodyHash); rmSync(path);
  assert.equal(f.store.audit().auditCoverage, "metadata-only"); assert.equal(f.store.readiness("work").ready, false);
  f.delegate("work"); assert.equal(f.store.read().length, 1); assert.equal(f.store.audit().missingBodies, 0);
  writeFileSync(path, "tampered"); assert.throws(() => f.store.audit());
  assert.throws(() => strictJson('{"id":"one","\\u0069d":"two"}'));
  const g = protocolFixture(); g.record(g.make("one", "status", {}));
  writeFileSync(g.store.path, readFileSync(g.store.path, "utf8").replace('"v":1', '"v":999'));
  assert.throws(() => g.store.audit());
});

test("본문의 원내 파일·링크·비밀과 metadata 원문을 거부하고 staging 보호를 남긴다", () => {
  const f = protocolFixture(), raw = join(f.root, "captain-raw.md"); writeFileSync(raw, "SYNTHETIC_DO_NOT_STAGE");
  assert.throws(() => readPrivateInput(f.root, raw)); assert.ok(handoffPrivacyIssues(f.root).some((s) => s.includes("captain-raw.md")));
  assert.equal(readFileSync(raw, "utf8"), "SYNTHETIC_DO_NOT_STAGE");
  const out = join(tempDir("pace-handoff-body-"), "source.md"); writeFileSync(out, "SYNTHETIC_EXTERNAL_BODY\r\n");
  assert.equal(readPrivateInput(f.root, out).toString(), "SYNTHETIC_EXTERNAL_BODY\r\n");
  const link = join(tempDir("pace-handoff-link-"), "source.md"); symlinkSync(out, link); assert.throws(() => readPrivateInput(f.root, link));
  rmSync(link); linkSync(out, link); assert.throws(() => readPrivateInput(f.root, out));
  assert.throws(() => f.record(f.make("long-metadata", "captain_input", { sourceRef: "fixture:" + "SYNTHETIC_RAW".repeat(100) })));
  const syntheticCredential = "password" + "=" + "super-secret-fixture-value";
  assert.throws(() => f.record(f.make("secret-body", "status", {}), syntheticCredential));
  assert.equal(f.store.read().length, 0);
});

function resourceFixture() {
  const f = protocolFixture();
  writeFileSync(join(f.root, ".pace/team/resources.md"), "# 합성 시험 자원\n```json\n" + JSON.stringify({ version: 1, resources: [{ name: "studio", capacity: 1, scope: "repo", description: "합성 시험", probe: [process.execPath, "-e", "process.exit(0)"] }] }) + "\n```\n");
  return f;
}
test("acquire/release/reclaim hook 실패는 실제 상태를 보존하고 applied만 중복 없이 보완한다", () => {
  for (const action of ["acquire", "release", "reclaim"] as const) {
    const f = resourceFixture(), sink = projectResourceSink(f.root, "P001");
    let dead = false, broken = action === "acquire";
    const actualCallback = sink.onApplied;
    sink.onApplied = (event) => { if (broken) throw new Error("synthetic-record-io-failure"); actualCallback(event); };
    const lock = new ResourceLock(f.root, "studio", { home: f.home, process: () => dead ? "dead" : "alive", probe: () => "free", events: sink });
    let priorId: string | undefined;
    if (action !== "acquire") { const acquired = lock.acquire("P001"); assert.equal(acquired.code, 0); priorId = acquired.lease!.acquisitionId; broken = true; }
    if (action === "release") assert.throws(() => lock.release(priorId!, { internal: true }));
    else { if (action === "reclaim") dead = true; assert.throws(() => lock.acquire("P001")); }
    const state = JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), "utf8"));
    assert.equal(state.active, action !== "release"); assert.ok(state.transitionId);
    if (action === "reclaim") assert.notEqual(state.acquisitionId, priorId);
    assert.ok(existsSync(join(lock.repoDir, "studio.guard")));
    const before = f.store.read().length; broken = false;
    assert.ok(lock.reconcileApplied().reconciled >= 1); const after = f.store.read().length;
    assert.equal(after, before + 1); lock.reconcileApplied(); assert.equal(f.store.read().length, after);
    assert.equal(f.store.read().at(-1)!.data.action, action);
    const applied = JSON.parse(readFileSync(join(sink.directory, `${state.transitionId}.applied.json`), "utf8"));
    assert.equal(f.store.read().at(-1)!.data.appliedAt, applied.at, "보완 시각과 별도로 실제 생산자 전이 시각을 보존한다");
    assert.ok(existsSync(join(lock.repoDir, "studio.guard")), "보완은 guard를 회수하거나 명령을 재실행하지 않는다");
    assert.equal(JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), "utf8")).acquisitionId, state.acquisitionId);
  }
});

test("상태 쓰기에 실패한 intent는 applied/소통 사건으로 승격하지 않는다", () => {
  const f = resourceFixture(), sink = projectResourceSink(f.root, "P001");
  const lock = new ResourceLock(f.root, "studio", { home: f.home, events: sink, probe: () => "free" });
  const rename = fs.renameSync;
  fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => { if (to === join(lock.stateDir, lock.stateName)) throw new Error("synthetic-state-write-failure"); return rename(from, to); }) as typeof fs.renameSync;
  syncBuiltinESMExports();
  try { assert.throws(() => lock.acquire("P001")); } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
  assert.equal(f.store.read().length, 0);
  assert.equal(lock.reconcileApplied().unconfirmed.length, 1); assert.equal(f.store.read().length, 0);
  // Synthetic fixture operator recovery only: the failed producer has no command/child.
  rmSync(join(lock.repoDir, "studio.guard"), { recursive: true }); rmSync(join(lock.machineDir, "studio.registry.guard"), { recursive: true });
  assert.equal(lock.acquire("P001").code, 0);
  const backfill = lock.reconcileApplied(); assert.equal(backfill.reconciled, 1); assert.equal(backfill.unconfirmed.length, 1);
  assert.equal(f.store.read().length, 1);
});

test("source CLI --project 잠금은 실제 명령 뒤 acquire/release를 연결하고 위조 자원 입력을 막는다", () => {
  const f = resourceFixture();
  const result = f.run("team", "lock", "studio", "--by", "P001", "--project", "P001", "--", process.execPath, "-e", "process.exit(0)");
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(f.store.read().map((r) => r.data.action), ["acquire", "release"]);
  const backfill = f.run("team", "handoff", "reconcile-resource", "P001", "studio"); assert.equal(backfill.status, 0, backfill.stderr);
  assert.equal(f.store.read().length, 2);
  assert.throws(() => f.record(f.make("forged", "resource_event", {})));
});

test("같은 요청 log+중계는 하나이며 coordinator 답·Orca 영수증은 캡틴 도달이 아니다", () => {
  const f = protocolFixture();
  const log = (type: "question" | "answer", requestId: string, by: "user" | "agent" | "coordinator", extra = {}) => assert.ok(recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type, by, requestId, msg: "합성 시험 요약", ...extra }));
  log("question", "business-one", "agent", { to: "coordinator" }); log("answer", "business-one", "coordinator");
  const first = f.record(f.make("question", "decision_request", { interpretation: false }, "agent:maker", "coordinator", "business-one"));
  f.record(f.make("relay", "decision_request", { interpretation: false, relayOf: first.id }, "coordinator", "captain", "business-one"));
  assert.throws(() => f.record(f.make("duplicate-root", "decision_request", { interpretation: false }, "coordinator", "captain", "business-one")), /중계 참조/);
  assert.throws(() => f.record(f.make("changed-relay", "decision_request", { interpretation: false, relayOf: first.id }, "coordinator", "captain", "business-one"), "SYNTHETIC_CHANGED_RELAY"), /중계가/);
  const route = { transport: "orca", actor: "coordinator", target: "term_fixture", from: "term_sender", sourceRef: "fixture:orca" };
  sendDelivery(f.store, "relay", "agent-delivery", route, () => ({ phase: "sent", responseHash: digest("fixture"), responseId: "msg_fixture" }));
  let report = collectHandoffs(f.root, "P001", relative(f.root, f.dir))!;
  assert.equal(report.requests.total, 1); assert.equal(report.requests.unconfirmed, 1); assert.equal(report.requests.captain_reply, 0);
  f.record(f.make("reply", "decision_reply", { re: first.id, decision: "reject", proposalHash: proposalDigest(first), sourceRef: "fixture:captain-answer" }, "captain", "coordinator", "business-one"), "SYNTHETIC_RAW_REJECTION");
  report = collectHandoffs(f.root, "P001", relative(f.root, f.dir))!; assert.equal(report.requests.captain_reply, 1);
  log("question", "business-two", "agent", { to: "captain" }); log("answer", "business-two", "agent", { src: "사용자 결정" });
  log("question", "business-three", "agent", { to: "captain" }); log("answer", "business-three", "user", { ref: "absent.md" });
  writeFileSync(join(f.dir, "receipt.md"), "Synthetic source receipt"); log("answer", "business-three", "user", { ref: "receipt.md" });
  report = collectHandoffs(f.root, "P001", relative(f.root, f.dir))!;
  assert.equal(report.requests.total, 3); assert.equal(report.requests.captain_reply, 2); assert.equal(report.requests.unconfirmed, 1);
  assert.ok(recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "question", by: "agent", msg: "합성 과거 미연결 질문" }));
  report = collectHandoffs(f.root, "P001", relative(f.root, f.dir))!; assert.equal(report.requests.unlinkedLogEvents, 1); assert.equal(report.requests.total, 3);
  const stats = f.run("project", "stats", "P001", "--json"); assert.equal(stats.status, 0, stats.stderr);
  assert.deepEqual(JSON.parse(stats.stdout).handoffs.requests, report.requests);
});

test("실제 사람 경로의 성공·실패만·불명은 BR01 우선순위를 따르고 옛 stats 형태를 유지한다", () => {
  const f = protocolFixture(), projectDir = relative(f.root, f.dir);
  assert.equal(collectHandoffs(f.root, "P001", projectDir), undefined);
  const old = JSON.parse(f.run("project", "stats", "P001", "--json").stdout); assert.equal(Object.hasOwn(old, "handoffs"), false);
  for (const [index, phase] of ["sent", "failed", "unconfirmed"].entries()) {
    const id = `business-${index}`; f.record(f.make(`question-${index}`, "decision_request", { interpretation: false }, "coordinator", "captain", id));
    const route = { transport: "external", actor: "captain", target: "existing-human-channel", from: "coordinator", sourceRef: "fixture:human-receipt" };
    prepareDelivery(f.store, `question-${index}`, `attempt-${index}`, route);
    deliveryReceipt(f.store, `attempt-${index}`, { phase, reportedBy: "coordinator", sourceRef: route.sourceRef, ...(phase === "sent" ? { responseHash: digest("fixture-receipt"), responseId: "fixture-receipt" } : {}) });
  }
  const report = collectHandoffs(f.root, "P001", projectDir)!;
  assert.equal(report.requests.captain_delivery, 1); assert.equal(report.requests.failed_only, 1); assert.equal(report.requests.unconfirmed, 1);
  const current = JSON.parse(f.run("project", "stats", "P001", "--json").stdout);
  assert.deepEqual(current.eventCounts, old.eventCounts);
  assert.equal(current.project.questionWaitMs, old.project.questionWaitMs);
  assert.equal(current.project.approvalWaitMs, old.project.approvalWaitMs);
  assert.deepEqual(current.tasks, old.tasks);
  const retryRoute = { transport: "external", actor: "captain", target: "existing-human-channel", from: "coordinator", sourceRef: "fixture:human-receipt" };
  prepareDelivery(f.store, "question-1", "failed-then-success", retryRoute);
  deliveryReceipt(f.store, "failed-then-success", { phase: "sent", reportedBy: "coordinator", sourceRef: retryRoute.sourceRef, responseHash: digest("synthetic-success-after-failure"), responseId: "fixture-late-success" });
  const retried = collectHandoffs(f.root, "P001", projectDir)!.requests;
  assert.equal(retried.total, 3); assert.equal(retried.failed_only, 0); assert.equal(retried.captain_delivery, 2); assert.equal(retried.unconfirmed, 1);
});

function finishFixture() {
  const f = protocolFixture(); f.delegate("unfinished-work");
  const projectPath = join(f.dir, "PROJECT.md");
  writeFileSync(projectPath, readFileSync(projectPath, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 합성 지시 기록 | 시험 |"));
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "# 합성 마감 시험\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | 합성 시험 |\n\n## 보안\n\n선언된 true 실행\n\n## 정본 반영\n\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| `docs/README.md` | 해당 없음 | 합성 시험 |\n\n## 지표\n\n[집계](METRICS.md)\n\n합성 시험의 로컬 본문과 열린 위임을 확인한다.\n");
  assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "synthetic-finish-fixture").status, 0);
  return f;
}
test("실제 finish는 열린 위임을 경고하며 원문을 HEAD/index에 넣지 않는다", () => {
  const f = finishFixture();
  const result = f.run("project", "finish", "P001"); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /열린 위임 1건/);
  assert.doesNotMatch(f.git("ls-files").stdout, /bodies\/|\.git\/pace\/handoffs/);
  assert.doesNotMatch(f.git("grep", "-n", "SYNTHETIC_FIXTURE_INSTRUCTION", "HEAD").stdout, /SYNTHETIC_FIXTURE_INSTRUCTION/);
  assert.doesNotMatch(f.git("diff", "--cached").stdout, /SYNTHETIC_FIXTURE_INSTRUCTION/);
  assert.equal(f.store.bodies.read(digest(f.instruction))!.toString(), f.instruction);
});
test("알려진 원내 raw 입력은 실제 finish가 staging 전에 보류하고 원본을 보존한다", () => {
  const f = finishFixture(), path = join(f.dir, "raw.md"); writeFileSync(path, "SYNTHETIC_CAPTAIN_RAW_NEVER_STAGE");
  assert.throws(() => readPrivateInput(f.root, path));
  const result = f.run("project", "finish", "P001"); assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /로컬 전용 원문 staging 금지/);
  assert.equal(f.git("ls-files", "--error-unmatch", relative(f.root, path)).status, 1);
  assert.equal(readFileSync(path, "utf8"), "SYNTHETIC_CAPTAIN_RAW_NEVER_STAGE");
});

test("source CLI는 원문→위임→수신 대조→결과→종결을 저장하고 같은 ID 재호출을 중복 집계하지 않는다", () => {
  const f = protocolFixture();
  const record = (h: HandoffHeader, body = f.instruction): HandoffRecord => {
    const path = join(f.root, "synthetic-header.json"); writeFileSync(path, JSON.stringify(h));
    const result = runPace(["team", "handoff", "record", "P001", "--file", path, "--body-file", "-"], { cwd: f.root, home: f.home, input: body });
    assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout).record;
  };
  const original = record(f.make("cli-input", "captain_input", { sourceRef: "fixture:source-cli-original" }));
  const delegate = record(f.make("cli-delegate", "delegate", { basis: { kind: "input", ref: original.id, hash: original.bodyHash, policy: f.locator }, plan: f.p }));
  assert.equal(f.run("team", "handoff", "ready", "P001", delegate.id).status, 1);
  record(f.make("cli-scope", "scope_check", { re: delegate.id, status: "within", basisHash: instructionDigest(delegate), checks: { instruction: true, decisionOwner: true, proofScope: true } }, "agent:maker", "coordinator"));
  assert.equal(f.run("team", "handoff", "ready", "P001", delegate.id).status, 0);
  writeFileSync(join(f.root, "proof.txt"), "synthetic-proof");
  record(f.make("cli-result", "result", { re: delegate.id, status: "done", evidence: [{ path: "proof.txt", hash: digest("synthetic-proof") }] }, "agent:maker", "coordinator"));
  const close = f.make("cli-close", "close", { re: delegate.id, result: "cli-result", proofScope: "T-1", checked: true }, "agent:reviewer", "coordinator");
  record(close); record(close);
  assert.equal(f.store.read().length, 5); assert.deepEqual(f.store.audit().open, []);
});

test("fake Orca 실행기는 실제 source CLI의 선기록과 정상/거절/모호 응답 수명을 확인한다", { skip: process.platform === "win32" }, () => {
  for (const outcome of ["sent", "failed", "unconfirmed"] as const) {
    const f = protocolFixture(); f.record(f.make("message", "status", {}));
    const toolDir = tempDir("pace-handoff-fake-orca-"), executable = join(toolDir, "orca-fixture"), counter = join(toolDir, "calls.json");
    const script = `#!${process.execPath}\nimport fs from 'node:fs';\nconst args=process.argv.slice(2);const rows=fs.readFileSync(${JSON.stringify(f.store.path)},'utf8').trim().split('\\n').map(JSON.parse);if(rows.at(-1).data.phase!=='started')process.exit(93);const body=args[args.indexOf('--body-file')+1];if(!fs.readFileSync(body,'utf8').includes('SYNTHETIC_FIXTURE_INSTRUCTION'))process.exit(94);fs.writeFileSync(${JSON.stringify(counter)},JSON.stringify(args));console.log(${JSON.stringify(outcome === "sent" ? '{"ok":true,"result":{"message_id":"msg_fixture"}}' : outcome === "failed" ? '{"ok":false,"error":"synthetic-rejected"}' : 'opaque-synthetic-ack')});\n`;
    writeFileSync(executable, script); chmodSync(executable, 0o700);
    const route = join(toolDir, "route.json"); writeFileSync(route, JSON.stringify({ transport: "orca", actor: "coordinator", target: "term_fixture", from: "term_sender", sourceRef: "fixture:orca" }));
    const run = (attempt: string) => runPace(["team", "handoff", "send", "P001", "message", "--route-file", route, "--attempt-id", attempt], { cwd: f.root, home: f.home, env: { ORCA_CLI_COMMAND: executable } });
    const result = run("fixture-attempt"); assert.equal(result.status, outcome === "sent" ? 0 : outcome === "failed" ? 1 : 2, result.stderr + result.stdout);
    const args = JSON.parse(readFileSync(counter, "utf8")); assert.ok(args.includes("--environment")); assert.ok(args.includes("local")); assert.ok(args.includes("handoff"));
    assert.equal(f.store.read().at(-1)!.data.phase, outcome);
    if (outcome !== "failed") { rmSync(counter); assert.equal(run("repeat-attempt").status, 2); assert.equal(existsSync(counter), false); }
  }
});

test("다른 worktree는 같은 로컬 본문을 대조하고 다른 clone은 metadata-only로 남는다", () => {
  const f = protocolFixture(), original = f.record(f.make("source", "captain_input", { sourceRef: "fixture:common-dir" }));
  assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "synthetic-ledger").status, 0);
  const worktree = join(tempDir("pace-handoff-worktree-"), "checkout"); assert.equal(f.git("worktree", "add", "--detach", worktree, "HEAD").status, 0);
  const other = new HandoffStore(worktree, "P001", relative(f.root, f.dir));
  assert.equal(other.bodies.path(original.bodyHash), f.store.bodies.path(original.bodyHash));
  assert.equal(other.bodies.read(original.bodyHash)!.toString(), f.instruction);
  const raw = join(worktree, "raw.md"); writeFileSync(raw, "SYNTHETIC_OTHER_WORKTREE_RAW");
  assert.throws(() => readPrivateInput(f.root, raw)); assert.equal(handoffPrivacyIssues(worktree).length, 1);
  const clone = join(tempDir("pace-handoff-clone-"), "checkout"); assert.equal(spawnSync("git", ["clone", "-q", f.root, clone], { env: sessionFreeEnv() }).status, 0);
  const copied = new HandoffStore(clone, "P001", relative(f.root, f.dir));
  assert.equal(copied.audit().auditCoverage, "metadata-only"); assert.equal(copied.audit().missingBodies, 1);
});

test("다른 저장소가 추적할 수 있는 separate-git-dir는 로컬 본문 저장소로 쓰지 않는다", () => {
  const f = fixture(), nested = join(f.root, "inner"), metadata = join(f.root, "exposed-metadata");
  assert.equal(spawnSync("git", ["init", "-q", "--separate-git-dir", metadata, nested], { env: sessionFreeEnv() }).status, 0);
  assert.throws(() => new HandoffStore(nested, "P001", "projects/P001_fixture"), /separate-git-dir/);
  assert.equal(existsSync(join(metadata, "pace/handoffs")), false);
  assert.deepEqual(handoffPrivacyIssues(nested), [], "소통 상태가 없는 기존 저장소에 새 보존 정책을 강제하지 않는다");
});

test("미등록 주체·없는 계획/증거 등 쓰기 전 일반 오류는 다음 정상 기록을 막지 않는다", () => {
  const f = protocolFixture();
  assert.throws(() => f.record(f.make("bad-agent", "status", {}, "agent:missing")));
  assert.equal(existsSync(join(f.store.bodies.root, "ledger.guard")), false);
  f.record(f.make("after-agent-error", "status", {}));
  const path = join(f.dir, "handoff-plans.json"), bytes = readFileSync(path); rmSync(path);
  assert.throws(() => f.delegate("missing-policy"));
  assert.equal(existsSync(join(f.store.bodies.root, "ledger.guard")), false);
  writeFileSync(path, bytes); const delegate = f.delegate("normal-delegate");
  f.record(f.make("scope", "scope_check", { re: delegate.id, status: "within", basisHash: instructionDigest(delegate), checks: { instruction: true, decisionOwner: true, proofScope: true } }, "agent:maker", "coordinator"));
  assert.throws(() => f.record(f.make("missing-evidence", "result", { re: delegate.id, status: "done", evidence: [{ path: "missing.txt", hash: digest("fixture") }] }, "agent:maker", "coordinator")));
  assert.equal(existsSync(join(f.store.bodies.root, "ledger.guard")), false);
  f.record(f.make("after-evidence-error", "status", {}));
});

test("무관한 계획 추가는 기존 위임을 유지하고 선택 계획/작성자 변경은 보류한다", () => {
  const f = protocolFixture(), delegate = f.delegate("existing-delegate"), path = join(f.dir, "handoff-plans.json");
  f.record(f.make("scope", "scope_check", { re: delegate.id, status: "within", basisHash: instructionDigest(delegate), checks: { instruction: true, decisionOwner: true, proofScope: true } }, "agent:maker", "coordinator"));
  const updated = { version: 1, declaredBy: "coordinator", plans: [f.p, { ...f.p, id: "other-plan", proofScope: "T-2" }] };
  writeFileSync(path, JSON.stringify(updated)); assert.equal(f.store.readiness(delegate.id).ready, true);
  writeFileSync(path, JSON.stringify({ ...updated, declaredBy: "captain" })); assert.equal(f.store.readiness(delegate.id).ready, false);
  writeFileSync(path, JSON.stringify({ ...updated, plans: [{ ...f.p, proofScope: "T-3" }] })); assert.equal(f.store.readiness(delegate.id).ready, false);
  writeFileSync(path, JSON.stringify(updated));
  writeFileSync(join(f.root, "proof.txt"), "synthetic-proof");
  f.record(f.make("done", "result", { re: delegate.id, status: "done", evidence: [{ path: "proof.txt", hash: digest("synthetic-proof") }] }, "agent:maker", "coordinator"));
  f.record(f.make("close", "close", { re: delegate.id, result: "done", proofScope: "T-1", checked: true }, "agent:reviewer", "coordinator"));
  assert.equal(f.store.audit().open.length, 0);
});

test("짧은 동시 원장 guard 경합은 자원 적용 callback이 유한 재시도한다", async () => {
  const f = resourceFixture(), sink = projectResourceSink(f.root, "P001"), guard = join(f.store.bodies.root, "ledger.guard");
  mkdirSync(guard);
  const child = spawnTestChild(process.execPath, ["-e", "setTimeout(()=>require('node:fs').rmdirSync(process.argv[1]),80)", guard], { env: sessionFreeEnv(), stdio: "ignore" });
  const exited = once(child, "exit");
  const lock = new ResourceLock(f.root, "studio", { home: f.home, events: sink, probe: () => "free" });
  assert.equal(lock.acquire("P001").code, 0); await exited;
  assert.equal(f.store.read().length, 1); assert.equal(existsSync(join(lock.repoDir, "studio.guard")), false);
});

test("requestId가 없는 옛 로그의 사건 수와 FIFO 대기 golden은 바뀌지 않는다", () => {
  const f = fixture(), repo = openRepo(f.root), ref = findProject(repo, "P001");
  const time = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
  for (const [cmd, second] of [["start", 0], ["finish", 60]] as const) recordMetric(f.dir, { ts: time(second), project: "P001", cmd, ok: true });
  const oldEvents = [{ ts: time(10), p: "P001", type: "question", by: "agent", msg: "합성 옛 질문" }, { ts: time(30), p: "P001", type: "answer", by: "coordinator", msg: "합성 옛 답" }] as const;
  for (const e of oldEvents) assert.ok(recordEvent(f.dir, e));
  const before = collectStats(repo, ref, time(60));
  assert.equal(before.project.questionWaitMs, 20000); assert.equal(before.project.approvalWaitMs, 20000); assert.equal(before.project.workMs, 40000);
  assert.equal(before.eventCounts.questions, 1); assert.equal(before.eventCounts.answers, 1);
  assert.equal(collectHandoffs(f.root, "P001", relative(f.root, f.dir)), undefined);
  const ledger = join(f.dir, "log.jsonl"), rows = readFileSync(ledger, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  writeFileSync(ledger, rows.map((e) => JSON.stringify(["question", "answer"].includes(e.type) ? { ...e, requestId: "same-business-request" } : e)).join("\n") + "\n");
  const after = collectStats(repo, ref, time(60)); assert.deepEqual(after, before);
  assert.equal(collectHandoffs(f.root, "P001", relative(f.root, f.dir))!.requests.total, 1);
});

test("이미 공개 추적 중인 정상 파일의 body 오입력은 거부하되 변경 없는 finish를 잠그지 않는다", () => {
  const f = finishFixture(), path = join(f.root, "docs/README.md");
  assert.throws(() => readPrivateInput(f.root, path)); assert.deepEqual(handoffPrivacyIssues(f.root), []);
  const original = readFileSync(path); writeFileSync(path, "SYNTHETIC_PRIVATE_REPLACEMENT");
  assert.equal(handoffPrivacyIssues(f.root).length, 1);
  writeFileSync(path, original); assert.deepEqual(handoffPrivacyIssues(f.root), []);
  const result = f.run("project", "finish", "P001"); assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("본문/머리/원장 한도 초과는 source CLI에서 저장 전에 거부하고 오류에 본문을 노출하지 않는다", () => {
  for (const target of ["body", "header", "ledger"] as const) {
    const f = protocolFixture(), path = join(f.root, "limit-header.json"), sentinel = "SYNTHETIC_PRIVATE_ERROR_SENTINEL";
    writeFileSync(path, JSON.stringify(f.make("limit", "status", {})));
    let input = sentinel;
    if (target === "body") input = sentinel + "가".repeat(Math.ceil(BODY_LIMIT / 3));
    if (target === "header") writeFileSync(path, JSON.stringify(f.make("limit", "status", {})) + " ".repeat(HEADER_LIMIT + 1));
    if (target === "ledger") writeFileSync(f.store.path, Buffer.alloc(LEDGER_LIMIT + 1, 32));
    const before = existsSync(f.store.path) ? digest(readFileSync(f.store.path)) : null;
    const result = runPace(["team", "handoff", "record", "P001", "--file", path, "--body-file", "-"], { cwd: f.root, home: f.home, input });
    assert.equal(result.status, 2, target); assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
    assert.match(result.stderr, /크기/, "문법 오류가 아니라 실제 크기 제한으로 거부해야 한다");
    assert.equal(existsSync(f.store.path) ? digest(readFileSync(f.store.path)) : null, before, "행/파일을 바꾸지 않는다");
    assert.equal(existsSync(join(f.store.bodies.root, "ledger.guard")), false);
  }
});

test("다른 위임의 완료 결과나 빈 done 증거를 종결에 사용할 수 없다", () => {
  const f = protocolFixture(), a = f.delegate("work-a"), b = f.delegate("work-b");
  writeFileSync(join(f.root, "proof.txt"), "synthetic-proof"); const evidence = [{ path: "proof.txt", hash: digest("synthetic-proof") }];
  for (const d of [a, b]) {
    f.record(f.make(`${d.id}-scope`, "scope_check", { re: d.id, status: "within", basisHash: instructionDigest(d), checks: { instruction: true, decisionOwner: true, proofScope: true } }, "agent:maker", "coordinator"));
    assert.throws(() => f.record(f.make(`${d.id}-empty-result`, "result", { re: d.id, status: "done", evidence: [] }, "agent:maker", "coordinator")), /증거 없는/);
    f.record(f.make(`${d.id}-done`, "result", { re: d.id, status: "done", evidence }, "agent:maker", "coordinator"));
  }
  const before = f.store.read().length;
  assert.throws(() => f.record(f.make("wrong-result-link", "close", { re: b.id, result: "work-a-done", proofScope: "T-1", checked: true }, "agent:reviewer", "coordinator")), /종결 조건/);
  assert.equal(f.store.read().length, before); assert.equal(f.store.audit().open.length, 2);
});

test("source CLI 확인 사슬과 종류/에이전트별 집계는 실제 승인·위임·결과·종결 수와 같다", () => {
  const f = protocolFixture();
  const original = cliRecord(f, f.make("cli-original", "captain_input", { sourceRef: "fixture:captain-raw" }), "SYNTHETIC_CAPTAIN_ORIGINAL_FOR_APPROVAL");
  const proposal = cliRecord(f, f.make("cli-proposal", "decision_request", { interpretation: true, of: original.id, plan: f.p }, "coordinator", "captain", "cli-business"));
  const reply = cliRecord(f, f.make("cli-approval", "decision_reply", { re: proposal.id, decision: "approve", proposalHash: proposalDigest(proposal), sourceRef: "fixture:captain-approval" }, "captain", "coordinator", "cli-business"), "SYNTHETIC_CAPTAIN_APPROVAL\r\n");
  const delegate = cliRecord(f, f.make("cli-approved-delegate", "delegate", { basis: { kind: "approved", ref: proposal.id, approval: reply.id, hash: proposalDigest(proposal) }, plan: f.p }));
  cliRecord(f, f.make("cli-within", "scope_check", { re: delegate.id, status: "within", basisHash: instructionDigest(delegate), checks: { instruction: true, decisionOwner: true, proofScope: true } }, "agent:maker", "coordinator"));
  writeFileSync(join(f.root, "proof.txt"), "synthetic-proof");
  cliRecord(f, f.make("cli-done", "result", { re: delegate.id, status: "done", evidence: [{ path: "proof.txt", hash: digest("synthetic-proof") }] }, "agent:maker", "coordinator"));
  cliRecord(f, f.make("cli-closed", "close", { re: delegate.id, result: "cli-done", proofScope: "T-1", checked: true }, "agent:reviewer", "coordinator"));
  const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); const h = JSON.parse(result.stdout).handoffs;
  assert.deepEqual(h.kinds, { captain_input: 1, decision_request: 1, decision_reply: 1, delegate: 1, scope_check: 1, result: 1, close: 1 });
  assert.deepEqual(h.agents, { coordinator: { captain_input: 1, decision_request: 1, delegate: 1 }, "agent:maker": { scope_check: 1, result: 1 }, "agent:reviewer": { close: 1 } });
  assert.deepEqual(h.open, []); assert.equal(h.requests.total, 1); assert.equal(h.requests.captain_reply, 1);
  assert.doesNotMatch(readFileSync(f.store.path, "utf8"), /SYNTHETIC_CAPTAIN_ORIGINAL_FOR_APPROVAL|SYNTHETIC_CAPTAIN_APPROVAL/);
});

test("partial/blocked 결과는 실제 finish 뒤에도 열린 위임 경고로 남는다", () => {
  for (const status of ["partial", "blocked"] as const) {
    const f = finishFixture();
    cliRecord(f, f.make(`${status}-result`, "result", { re: "unfinished-work", status, evidence: [] }, "agent:maker", "coordinator"));
    const result = f.run("project", "finish", "P001"); assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /열린 위임 1건 \(partial\/blocked 포함\)/);
    assert.equal(f.store.read().find((r) => r.kind === "result")!.data.status, status); assert.deepEqual(f.store.audit().open, ["unfinished-work"]);
  }
});

test("수정한 공개 추적 파일의 오입력 뒤 HEAD 내용으로 되돌리면 finish 보호를 해소한다", () => {
  const f = finishFixture(), path = join(f.root, "docs/README.md"), publicBytes = readFileSync(path);
  writeFileSync(path, "SYNTHETIC_PRIVATE_MODIFICATION"); assert.throws(() => readPrivateInput(f.root, path));
  assert.equal(handoffPrivacyIssues(f.root).length, 1); writeFileSync(path, publicBytes); assert.deepEqual(handoffPrivacyIssues(f.root), []);
  const result = f.run("project", "finish", "P001"); assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("source CLI 자원 hook 실패 때 실제 사용자 명령은 시작하지 않는다", () => {
  const f = resourceFixture(), guard = join(f.store.bodies.root, "ledger.guard"), marker = join(f.home, "must-not-run.txt");
  f.store.bodies.ensure(); mkdirSync(guard);
  const result = f.run("team", "lock", "studio", "--by", "P001", "--project", "P001", "--", process.execPath, "-e", "require('node:fs').writeFileSync(process.argv[1],'SYNTHETIC_COMMAND_EXECUTED')", marker);
  assert.equal(result.status, 2); assert.equal(existsSync(marker), false);
  const lock = new ResourceLock(f.root, "studio", { home: f.home }), state = JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), "utf8"));
  assert.equal(state.active, true); assert.equal(state.phase, "pre-start"); assert.equal(state.child, null);
  assert.equal(f.store.read().length, 0); assert.equal(existsSync(join(lock.repoDir, "studio.guard")), true);
});

test("project log --request-id source CLI는 요청을 연결하고 잘못된 종류/식별자는 행 없이 거부한다", () => {
  const f = fixture();
  const question = f.run("project", "log", "P001", "--type", "question", "--by", "agent", "--to", "coordinator", "--request-id", "source-cli-business", "--msg", "합성 CLI 질문");
  assert.equal(question.status, 0, question.stderr);
  const answer = f.run("project", "log", "P001", "--type", "answer", "--by", "coordinator", "--request-id", "source-cli-business", "--msg", "합성 CLI 자체 답");
  assert.equal(answer.status, 0, answer.stderr);
  const path = join(f.dir, "log.jsonl"), bytes = readFileSync(path, "utf8"), rows = bytes.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(rows.slice(-2).map((r) => r.requestId), ["source-cli-business", "source-cli-business"]);
  for (const [type, requestId] of [["note", "source-cli-business"], ["question", "INVALID request"]]) {
    const invalid = f.run("project", "log", "P001", "--type", type!, "--request-id", requestId!, "--msg", "합성 잘못된 호출");
    assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr); assert.match(invalid.stderr, /requestId/); assert.equal(readFileSync(path, "utf8"), bytes);
  }
  const stats = f.run("project", "stats", "P001", "--json"); assert.equal(stats.status, 0, stats.stderr); const data = JSON.parse(stats.stdout);
  assert.equal(data.eventCounts.questions, 1); assert.equal(data.eventCounts.answers, 1);
  assert.equal(data.handoffs.requests.total, 1); assert.equal(data.handoffs.requests.unconfirmed, 1); assert.equal(data.handoffs.requests.captain_reply, 0);
});
