import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { decideReviewAdmission, type AdmissionState } from "/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t09-tester-r2/isolated/src/agent/review-admission.ts";
import { AgentError, normalizeResult, type Executor } from "/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t09-tester-r2/isolated/src/agent/contract.ts";
import { reviewNoteCommand, verifyCommand } from "/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t09-tester-r2/isolated/src/agent/verify-cli.ts";
import { reviewHash } from "/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t09-tester-r2/isolated/src/project/pre-review.ts";
import { scopedReviewFixture, tempDir } from "/private/var/folders/0k/n9rvmztx6xs3xvjsvf0qqzdw0000gn/T/pace-p013-t01-f1jlbjjp/t09-tester-r2/isolated/test/helpers.ts";

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
  return { root, target, prompts, verify, note, exhaust,
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

async function failThroughDiagnosis(h: Awaited<ReturnType<typeof recoveryFixture>>) {
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
  const failed = await h.verify();
  assert.equal(failed.json.escalation.stage, "upper_review");
  assert.equal(failed.json.followup.type, "confirmation");
  return (await h.verify()).json.followup;
}


test("r2 independent F1 fail preserves F2, F2 pass preserves F1, prompt stays focused", async () => {
 const h = await recoveryFixture("task", false, stageFailure("defect", ["F1","fixture.ts:1"],["F2","save.ts:2"]));
 const base = (await h.verify()).json.followup;
 writeFileSync(h.target,"F1 modification\n");
 assert.equal((await h.focus()).code,0);
 const first=await h.verify([],stageFailure("defect",["F1","fixture.ts:1"]));
 assert.equal(first.json.review.verdict,"fail");
 assert.match(h.prompts.at(-1)!,/지정한 지적과 적용한 수정의 영향만 판정한다/);
 assert.doesNotMatch(h.prompts.at(-1)!,/판정 범위: 직전 검토의 blocking이 해소/);
 const remaining=(await h.verify()).json.followup;
 assert.equal(remaining.confirmation_source,base.confirmation_source);
 assert.deepEqual(remaining.confirmation_findings,[{id:"F1",location:"fixture.ts:1"},{id:"F2",location:"save.ts:2"}]);
 writeFileSync(h.target,"F2 modification\n");
 assert.equal((await h.focus("F2","save.ts:2","save.ts required paths")).code,0);
 const second=await h.verify([],"pass");
 assert.equal(second.json.followup.next,"diagnose");
 const report=(await h.verify()).json.followup;
 assert.deepEqual(report.confirmation_findings,[{id:"F1",location:"fixture.ts:1"}]);
 assert.equal(report.confirmation_count,2);
 console.log("r2 F1/F2 observations",JSON.stringify({first:first.json.review.verdict,remaining:remaining.confirmation_findings,afterF2:report.confirmation_findings,action:report.action,budget:second.json.budget}));
});

test("r2 independent equivalent wording keeps budget and rejects stale or incomplete proof",async()=>{
 const h=await recoveryFixture(); const report=await failThroughDiagnosis(h);
 const root=await h.recordRoot(report.upper.trigger,1); assert.equal(root.code,0);
 writeFileSync(h.contract,"Same agreement, clarified wording\n"); writeFileSync(h.target,"Solution for clarified wording\n");
 const current=reviewHash(readFileSync(h.contract,"utf8"));
 assert.equal((await h.recordFix(root.json.entry.id)).code,2);
 assert.equal((await h.recordFix(root.json.entry.id,{agreement:"equivalent",previous:report.upper.contract,contract:current})).code,2);
 assert.equal((await h.recordFix(root.json.entry.id,{agreement:"equivalent",previous:report.upper.contract,contract:current,comparison:"same required behavior and evidence"})).code,0);
 const result=await h.verify([],"pass"); assert.equal(result.json.review.verdict,"pass");
 const held=await h.verify(); assert.equal(held.code,16);
 assert.deepEqual([held.json.budget.calls,held.json.budget.rounds,held.json.followup.joint_attempts,held.json.followup.confirmation_count,held.json.followup.diagnostic_confirmation_count],[2,2,2,1,1]);
 console.log("r2 equivalent observations",JSON.stringify({next:result.json.followup.next,action:held.json.followup.action,budget:held.json.budget,upper_results:held.json.followup.upper_results}));
});

test("r2 independent fully resolved original findings reports confirmation, not a new ordinary pass",async()=>{
 const h=await recoveryFixture("task",false,stageFailure("defect",["F1","fixture.ts:1"],["F2","save.ts:2"]));
 for(const [id,loc] of [["F1","fixture.ts:1"],["F2","save.ts:2"]]){
  writeFileSync(h.target,id+" fix\n"); assert.equal((await h.focus(id,loc,"fixture.ts save.ts required behavior")).code,0); assert.equal((await h.verify([],"pass")).json.review.verdict,"pass");
 }
 const held=await h.verify();assert.equal(held.code,16);assert.equal(held.json.followup.action,"confirmed_findings");assert.deepEqual(held.json.followup.confirmation_findings,[]);
 assert.equal(held.json.followup.review_history.at(-1).verdict,"pass");assert.match(held.json.followup.verdict_summary,/최신 유효 판정 fail/);
 console.log("r2 confirmed observations",JSON.stringify({action:held.json.followup.action,summary:held.json.followup.verdict_summary,confirmations:held.json.followup.confirmations.map((x:any)=>({finding:x.finding,verdict:x.verdict})),budget:held.json.budget}));
});

test("r2 independent B1 resumes the same confirmation and preserves provenance",async()=>{
 const h=await recoveryFixture();writeFileSync(h.target,"required F1 repair\n");
 const grant=await h.focus();assert.equal(grant.code,0);
 h.setAvailable(false);const unavailable=await h.verify();assert.equal(unavailable.code,10);
 h.setAlternate({agent:"claude",mode:"p",capabilities:{models:true,effort:true,systemPrompt:false,resume:false,writeAccess:true},async run(request){return normalizeResult(request,{text:scopedReviewFixture(request.prompt,"pass"),provider:"anthropic"},{durationMs:1,enforcement:"fake"});}});
 const resumed=await h.verify(["--allow-same-provider"]);assert.equal(resumed.code,0);assert.equal(resumed.json.cross,false);assert.equal(resumed.json.followup.id,grant.json.entry.id);
 const report=(await h.verify()).json.followup;assert.equal(report.confirmation_count,1);assert.equal(report.confirmations[0].cross,false);assert.deepEqual(report.confirmations[0].cross_unavailable,resumed.json.cross_unavailable);assert.deepEqual([resumed.json.budget.calls,resumed.json.budget.rounds],[2,2]);
 const record=JSON.parse(readFileSync(join(h.root,resumed.json.review.record),"utf8"));assert.deepEqual(record.cross_unavailable,resumed.json.cross_unavailable);
 console.log("r2 B1 observations",JSON.stringify({sameGrant:true,count:report.confirmation_count,cross:resumed.json.cross,reasons:resumed.json.cross_unavailable}));
});

test("r2 independent changed upper evidence blocks execution before executor call",async()=>{
 const h=await recoveryFixture();const report=await failThroughDiagnosis(h);const root=await h.recordRoot(report.upper.trigger,1);assert.equal(root.code,0);
 writeFileSync(h.target,"upper fix\n");assert.equal((await h.recordFix(root.json.entry.id)).code,0);
 writeFileSync(join(h.root,"evidence/root-1.json"),"changed review evidence\n");const calls=h.prompts.length;const denied=await h.verify([],"pass");assert.equal(denied.code,2);assert.equal(h.prompts.length,calls);assert.match(denied.json.error.message,/根拠|근거/);
});
