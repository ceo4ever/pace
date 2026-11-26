import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { decideReviewAdmission, type AdmissionState } from "../../../../../src/agent/review-admission.ts";
import { AgentError, normalizeResult, type Executor } from "../../../../../src/agent/contract.ts";
import { reviewNoteCommand, verifyCommand } from "../../../../../src/agent/verify-cli.ts";
import { reviewHash } from "../../../../../src/project/pre-review.ts";
import { scopedReviewFixture, tempDir } from "../../../../../test/helpers.ts";

function fixture(unit = "task", artifact?: string) {
  const root = join(tempDir("pace-followup-"), unit === "task"
    ? "projects/P013_review/tasks/T02_followup" : "backlogs/BL261126_01_review");
  mkdirSync(join(root, "evidence"), { recursive: true });
  const target = join(root, artifact ?? (unit === "task" ? "change.patch" : "BACKLOG.md"));
  const proof = join(root, "evidence/finding.md");
  const waiver = join(root, "evidence/waiver.json");
  writeFileSync(proof, "독립 tester의 지적, 재현 조건 V1, 실패 재현 원문\nfail\n");
  const prompts: string[] = [];
  let available = true;
  let tick = 0;
  let alternate: Executor | undefined;
  const run = async (verify: boolean, selected: string, args: string[], reply: string, wait?: () => Promise<void>) => {
    const output: string[] = [];
    const executor: Executor = {
      agent: "codex", mode: "p",
      capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
      async run(request) {
        prompts.push(request.prompt);
        await wait?.();
        const text = reply.includes("```pace-review") ? reply : scopedReviewFixture(request.prompt, reply);
        return normalizeResult(request, { text, provider: "openai" }, { durationMs: 1, enforcement: "fake" });
      },
    };
    const deps = { executors: () => [...(available ? [executor] : []), ...(alternate ? [alternate] : [])],
      write: (text: string) => output.push(text), now: () => new Date(Date.UTC(2026, 10, 26) + tick++) };
    const code = verify
      ? await verifyCommand(["--author-agent", "claude", "--target", selected, "--purpose", "목적", ...args], deps)
      : await reviewNoteCommand(["--target", selected, ...args], deps);
    return { code, json: JSON.parse(output.join("")) };
  };
  const verify = (args: string[] = [], reply = "F1 [blocking] 재현\nfail", selected = target, wait?: () => Promise<void>) => run(true, selected, args, reply, wait);
  const note = (args: string[], selected = target, assessments = [{ finding: "F1 [blocking] fixture.ts:1 — 재현", decision: "A-3", reason: "필수 판정 생략을 제안했다" }]) => {
    let file = proof;
    if (args.includes("--request-waiver")) {
      const recommendation = args.includes("--choice") ? args[args.indexOf("--choice") + 1] : "";
      writeFileSync(waiver, JSON.stringify({ choices: [recommendation, "필수 검증 생략안을 검토한다"], assessments }));
      file = waiver;
    }
    return run(false, selected, [...args, "--summary", "기존 지적의 재현과 조치", ...(args.includes("--file") ? [] : ["--file", file])], "");
  };
  const exhaust = async (selected = target) => {
    writeFileSync(selected, "첫 대상\n");
    assert.equal((await verify([], "F1 [blocking] 재현\nfail", selected)).code, 0);
    writeFileSync(selected, "두 번째 대상\n");
    const second = await verify([], "F1 [blocking] 재현\nfail", selected);
    assert.equal(second.code, 0);
    writeFileSync(selected, "최신 수정\n");
    return second.json.review.record as string;
  };
  const noteBare = (args: string[], selected = target) => run(false, selected, [...args, "--summary", "구조 원인"], "");
  return { root, target, prompts, verify, note, noteBare, exhaust,
    setAvailable: (value: boolean) => { available = value; },
    setAlternate: (value: Executor) => { alternate = value; } };
}


function stageFailure(category: string, ...findings: [string, string][]) {
  return ["```pace-review", JSON.stringify({
    version: 1, findings: findings.map(([id, location]) => ({ id, location, category, severity: "blocking", scenario: "재현",
      reproduction: "수정 전 입력을 다시 실행한다", confidence: "high" })),
  }), "```", "fail"].join("\n");
}

async function recoveryFixture(unit = "task", useCallCap = false, finalReply?: string) {
  const h = fixture(unit, unit === "backlog" ? "BR01_example.md" : undefined);
  const contract = join(h.root, unit === "task" ? "TASK.md" : "BACKLOG.md");
  writeFileSync(contract, "합의한 계약과 검증 기준\n");
  writeFileSync(h.target, "수정 전\n");
  if (useCallCap) {
    h.setAvailable(false);
    assert.equal((await h.verify()).code, 10);
    assert.equal((await h.verify()).code, 10);
    h.setAvailable(true);
  }
  await h.exhaust();
  for (const n of [1, 2]) {
    writeFileSync(h.target, `공동 확인 ${n}\n`);
    assert.equal((await h.note(["--joint", "--choice", "독립 지적 보완"])).code, 0);
    assert.equal((await h.verify([], n === 2 ? finalReply : undefined)).code, 0);
  }
  const focus = (id = "F1", location = "fixture.ts:1", impact = "fixture.ts의 저장과 재입력 범위") =>
    h.note(["--confirm", id, "--location", location, "--impact", impact]);
  const proof = (name: string, fields: object) => {
    const path = join(h.root, "evidence", name);
    writeFileSync(path, JSON.stringify(fields));
    return path;
  };
  const recordRoot = (trigger: string, slot: 1 | 2, changes: Record<string, unknown> = {}) => h.note([
    "--upper-review", "--file", proof(`root-${slot}.json`, {
      trigger, slot, reviewer: "independent-reviewer", author: "author", worker: "worker",
      target: relative(h.root, h.target), hash: reviewHash(readFileSync(h.target, "utf8")),
      provider: "openai", context: `independent-context-${slot}`, cross: true, analysis: "원인과 대안 및 포착 범위를 관측했다",
      ...(slot === 2 ? { contract: "태스크의 판정 기준을 대조했다", backlog: "백로그 목적과 인수 기준을 대조했다" } : {}),
      ...changes,
    }),
  ]);
  const recordFix = (upper: string, changes: Record<string, unknown> = {}) => h.note(["--upper-check", "--impact", "fixture.ts 저장과 재입력",
    "--file", proof("root-fix.json", { upper, agreement: "confirmed", verification: "required", change: "저장 기준과 원인 조치", ...changes })]);
  return { ...h, contract, focus, proof, recordRoot, recordFix };
}

async function failThroughDiagnosis(h: Awaited<ReturnType<typeof recoveryFixture>>, diagnosedReply?: string) {
  writeFileSync(h.target, "첫 지적 수정\n");
  const focus = await h.focus();
  assert.equal(focus.code, 0, JSON.stringify(focus.json));
  assert.equal((await h.verify()).json.followup.type, "confirmation");
  writeFileSync(h.target, "구조 원인 수정\n");
  assert.equal((await h.focus()).code, 2);
  assert.match((await h.verify()).json.followup.action, /^diagnose$/);
  const diagnosed = await h.note(["--diagnosis", "--layer", "structure"]);
  assert.equal(diagnosed.code, 0);
  assert.equal(diagnosed.json.entry.type, "diagnosis");
  assert.equal((await h.focus()).json.entry.diagnosed, true);
  const failed = await h.verify([], diagnosedReply);
  assert.equal(failed.json.escalation.stage, "upper_review");
  assert.equal(failed.json.followup.type, "confirmation");
  return (await h.verify()).json.followup;
}


import { reviewBudgetScope } from "../../../../../src/agent/review-budget.ts";
import { readReviewState } from "../../../../../src/agent/review-followup.ts";
for (const unit of ["task", "backlog"]) {
  test(`직접 반례 ${unit}: 다른 대상 pass와 unknown은 진단을 닫지 않고 다른 대상 fail도 단위를 막는다`, async () => {
    const h = fixture(unit);
    const other = join(h.root, unit === "task" ? "TASK.md" : "BR02_other.md");
    writeFileSync(h.target, "실패 대상 v1\n");
    writeFileSync(other, "다른 대상 v1\n");
    assert.equal((await h.verify()).json.review.verdict, "fail");
    const d = await h.note(["--diagnosis", "--layer", "structure"]);
    assert.equal(d.code, 0);
    assert.equal((await h.verify([], "pass", other)).json.review.verdict, "pass");
    if (unit === "backlog") {
      assert.ok(readReviewState(reviewBudgetScope(h.target)!,reviewHash("next")).activeDiagnosis);
      const held = await h.verify([],"never");
      assert.equal(held.code,16);
      assert.equal(held.json.reason,"budget_exhausted");
      const h2 = fixture("backlog");
      writeFileSync(h2.target,"별도 실패\n");
      const other2=join(h2.root,"BR02_other.md");
      writeFileSync(other2,"별도 다른 대상\n");
      await h2.verify();
      const d2=await h2.note(["--diagnosis","--layer","structure"]);
      assert.equal((await h2.verify([],"미확인",other2)).json.review.verdict,"unknown");
      const f2=await h2.verify([],"F8 [blocking] 다른 대상 재현\nfail",other2);
      assert.equal(f2.json.escalation?.stage,"upper_review",JSON.stringify(f2));
      const b2=await h2.verify();
      assert.equal(b2.code,16);
      assert.equal(b2.json.followup.upper.trigger,d2.json.entry.recovery_id);
      console.log(JSON.stringify({probe:"backlog-other-target",unrelatedPassDiagnosisActive:true,unknown:"unknown",failure:"fail",blocked:16}));
      return;
    }
    writeFileSync(other, "다른 대상 v2\n");
    const u = await h.verify([], "판정 미확인", other);
    assert.equal(u.code, 0, JSON.stringify(u));
    assert.equal(u.json.review.verdict,"unknown");
    writeFileSync(other, "다른 대상 v3\n");
    // backlog shares ordinary budget, so use the existing explicit joint route when exhausted.
    if (unit === "backlog") assert.equal((await h.note(["--joint", "--choice", "독립 재실패 확인"], other)).code, 0);
    const failed = await h.verify([], "F8 [blocking] 다른 대상 재현\nfail", other);
    assert.equal(failed.json.escalation?.stage, "upper_review", JSON.stringify(failed));
    const blocked = await h.verify();
    assert.equal(blocked.code, 16);
    assert.equal(blocked.json.followup.upper.trigger, d.json.entry.recovery_id);
    assert.equal(blocked.json.followup.upper.target, relative(h.root, other));
    console.log(JSON.stringify({probe:unit+"-other-target", failure:failed.json.review.verdict, trigger:blocked.json.followup.upper.target, blocked:blocked.code}));
  });
  test(`직접 반례 ${unit}: 원래 대상 pass가 진단을 닫은 뒤 다른 대상 fail은 상위 검토를 발동하지 않는다`, async () => {
    const h = fixture(unit);
    const other = join(h.root, unit === "task" ? "TASK.md" : "BR02_other.md");
    writeFileSync(h.target, "원래 실패\n");
    writeFileSync(other, "새 대상\n");
    await h.verify();
    assert.equal((await h.note(["--diagnosis", "--layer", "structure"])).code, 0);
    writeFileSync(h.target, "원래 대상 수정\n");
    const passed = await h.verify([], "pass");
    assert.equal(passed.json.review.verdict, "pass");
    const scope = reviewBudgetScope(h.target)!;
    assert.equal(readReviewState(scope, reviewHash(readFileSync(h.target,"utf8"))).activeDiagnosis, undefined);
    if (unit === "backlog") {
      // A new stage cannot be opened after this stage passed. Inspect closure directly.
      assert.equal((await h.verify([], "never", other)).json.followup.upper, undefined);
    } else {
      const failed = await h.verify([], "F9 [blocking] 새 대상 실패\nfail", other);
      assert.equal(failed.json.review.verdict, "fail");
      assert.equal(failed.json.escalation, undefined);
    }
    console.log(JSON.stringify({probe:unit+"-same-target-pass", verdict:passed.json.review.verdict, activeDiagnosis:false}));
  });
  test(`직접 반례 ${unit}: 진단 근거 누락·타 대상 진단·변조는 실행 전에 거부한다`, async () => {
    const h = fixture(unit);
    writeFileSync(h.target, "실패 v1\n");
    await h.verify();
    assert.equal((await h.noteBare(["--diagnosis", "--layer", "structure"])).code, 2);
    const other = join(h.root, "unreviewed.md");
    writeFileSync(other,"검토 안 됨\n");
    assert.equal((await h.note(["--diagnosis", "--layer", "structure"], other)).code, 2);
    const d = await h.note(["--diagnosis", "--layer", "structure"]);
    assert.equal(d.code, 0);
    writeFileSync(join(h.root,"evidence/finding.md"), "진단 이후 바뀐 근거\n");
    writeFileSync(h.target,"수정 v2\n");
    const calls = h.prompts.length;
    const refused = await h.verify();
    assert.equal(refused.code, 2);
    assert.match(refused.json.error.message,/근거/);
    assert.equal(h.prompts.length,calls);
    console.log(JSON.stringify({probe:unit+"-proof", missing:2, otherTarget:2, tampered:refused.code, executorCallsAdded:0}));
  });
}

test("직접 반례: 사후 두 원장의 동일 이름 pass도 원래 진단을 닫지 않는다", async () => {
  const h = fixture();
  writeFileSync(join(h.root,"TASK.md"),"동일한 합의 계약\n");
  const other = join(h.root,"evidence/change.patch");
  writeFileSync(h.target,"루트 실패\n");
  writeFileSync(other,"다른 원장 대상\n");
  await h.verify();
  await h.note(["--diagnosis","--layer","structure"]);
  const p = await h.verify([],"pass",other);
  assert.equal(p.code,0,JSON.stringify(p));
  assert.equal(p.json.review.verdict,"pass");
  const s = readReviewState(reviewBudgetScope(h.target)!,reviewHash("수정\n"));
  assert.ok(s.activeDiagnosis);
  assert.equal(s.recovery.upper,null);
  console.log(JSON.stringify({probe:"same-name-other-ledger",activeDiagnosis:true}));
});

test("직접 반례: 두 번 상위 실패의 기본 추천·재현과 공식 세 선택은 파일/응답에 일치한다", async () => {
  const h = await recoveryFixture("task");
  const report = await failThroughDiagnosis(h);
  for (const slot of [1,2] as const) {
    const root = await h.recordRoot(report.upper.trigger,slot,{root_cause:`근본 원인 ${slot}`});
    assert.equal(root.code,0);
    writeFileSync(h.target,`해결안 ${slot}\n`);
    if (slot === 2) assert.equal((await h.recordFix(root.json.entry.id,{recommendation:{choice:"임의 추가",reason:"비공식"}})).code,2);
    assert.equal((await h.recordFix(root.json.entry.id,{change:`실제 적용 ${slot}`})).code,0);
    assert.equal((await h.verify([],stageFailure("defect",["F7",`failure.ts:${slot}`]))).json.escalation.stage,slot===1?"upper_review":"agreement_required");
  }
  const held=await h.verify();
  assert.equal(held.code,16);
  const ep=held.json.followup.endpoint;
  assert.deepEqual(ep.choices,["기준 조정","보류","한 번 더"]);
  assert.deepEqual(ep.recommendation.source,"default");
  assert.equal(ep.recommendation.choice,"보류");
  assert.ok(ep.recommendation.reason.length);
  assert.deepEqual(ep.timeline.upper.map((r:any)=>[r.root_cause,r.applied_solution,r.verdict]),[["근본 원인 1","실제 적용 1","fail"],["근본 원인 2","실제 적용 2","fail"]]);
  assert.equal(ep.remaining_failure.findings[0].location,"failure.ts:2");
  assert.equal(ep.remaining_failure.findings[0].reproduction,"수정 전 입력을 다시 실행한다");
  assert.deepEqual(JSON.parse(readFileSync(join(h.root,held.json.followup.report),"utf8")).endpoint,ep);
  console.log(JSON.stringify({probe:"default-endpoint",endpoint:ep}));
});
