import { spawnSync } from "node:child_process";
import { recordEvent } from "../src/project/event-log.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, lstatSync, symlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { collectDashboard, collectInsights, formatDashboard, refreshProjectMetrics, replaceMetricsSection, metricsSummaryIssues } from "../src/project/metrics-report.ts";
import { recordMetric } from "../src/project/metrics.ts";
import type { ProjectRef, Repo } from "../src/project/harness.ts";
import { tempDir } from "./helpers.ts";
function fixture() {
  const root = tempDir(); const dir = join(root, "projects", "P001_261024_test"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PROJECT.md"), "# P001\n- 상태: 진행\n| T01 | one | — | 완료 | |\n| T02 | two | — | 완료 | |\n");
  const repo: Repo = { root, mainRoot: root, base: "main", branch: "project/P001", inWorktree: true };
  const ref: ProjectRef = { id: "P001", dir: "P001_261024_test", name: "test", branch: repo.branch, worktree: root };
  return { root, dir, repo, ref };
}
test("metrics report: section replacement preserves neighbors and removes duplicate generated sections", () => {
  const original = "# Close\n\n## 회고\n\nkeep before\n\n## 지표\n\nold body\n\n## 배포\n\nkeep after\n";
  const once = replaceMetricsSection(original, "new stats"); const twice = replaceMetricsSection(once, "new stats");
  assert.equal(once, twice);
  assert.match(once, /## 회고\n\nkeep before/); assert.match(once, /## 배포\n\nkeep after/);
  assert.ok(!once.includes("old body")); assert.equal((once.match(/^## 지표$/gm) ?? []).length, 1);
  assert.equal((replaceMetricsSection(original + "\n## 지표\n\nduplicate\n", "new stats").match(/^## 지표$/gm) ?? []).length, 1);
  assert.match(replaceMetricsSection("# old close\n", "new"), /## 지표[\s\S]*new/);
});
test("metrics report: repeated gate categories and review rounds, nonempty handoff links without raw text", () => {
  const f = fixture();
  for (const [task, review, handoff] of [["T01", "1차: tester fail · reviewer blocking 2 · should_fix 1\n2차: tester pass · reviewer blocking 0", "PRIVATE_HANDOFF_CONTENT"], ["T02", "1차: tester fail · reviewer blocking 1 · should_fix 1", "없음"]]) {
    const dir = join(f.dir, "tasks", `${task}_test`); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "TASK-CLOSE.md"), `# close\n\n## 리뷰\n\n${review}\n\n## 남긴 것\n\n${handoff}\n`);
  }
  for (const reason of ["contract", "contract", "security"]) recordMetric(f.dir, { ts: new Date().toISOString(), project: "P001", cmd: "check", task: "T01", ok: false, reason });
  const insights = collectInsights(f.repo, f.ref);
  assert.deepEqual(insights.reviews, [{ task: "T01", blocking: 2, shouldFix: 1, testerFailures: 1 }, { task: "T02", blocking: 1, shouldFix: 1, testerFailures: 1 }]);
  assert.deepEqual(insights.improvements.find((i) => i.kind === "gate"), { kind: "gate", code: "contract", count: 2, tasks: [] });
  assert.ok(!insights.improvements.some((i) => i.code === "security"));
  assert.deepEqual(insights.improvements.filter((i) => i.kind === "review"), [
    { kind: "review", code: "blocking", count: 3, tasks: ["T01", "T02"] },
    { kind: "review", code: "should_fix", count: 2, tasks: ["T01", "T02"] },
    { kind: "review", code: "tester fail", count: 2, tasks: ["T01", "T02"] },
  ]);
  assert.equal(insights.improvements.filter((i) => i.kind === "handoff").length, 1);
  const dashboard = collectDashboard(f.repo, f.ref, { home: tempDir(), env: {} });
  assert.match(formatDashboard(dashboard), /리뷰 지적: blocking 3 · should_fix 2 · tester fail 2/);
  assert.ok(!JSON.stringify(dashboard).includes("PRIVATE_HANDOFF_CONTENT"));
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "# close\n\n## 회고\n\nkeep\n");
  refreshProjectMetrics(f.repo, f.ref, { home: tempDir(), env: {} });
  const close = readFileSync(join(f.dir, "METRICS.md"), "utf8");
  assert.match(close, /\[검토\]\(tasks\/T01_test\/TASK-CLOSE.md\)/);
  assert.ok(!close.includes("PRIVATE_HANDOFF_CONTENT")); assert.match(readFileSync(join(f.dir, "PROJECT-CLOSE.md"), "utf8"), /## 회고\n\nkeep/);
});
test("metrics report: finishing snapshot extends previous finish cutoff", () => {
  const f = fixture(); const home = tempDir(); const start = "2026-01-01T00:00:00.000Z";
  recordMetric(f.dir, { ts: start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: "2026-01-01T00:00:10.000Z", project: "P001", cmd: "finish", ok: true });
  const sessions = join(home, ".codex", "sessions"); mkdirSync(sessions, { recursive: true });
  writeFileSync(join(sessions, "one.jsonl"), [
    { type: "session_meta", payload: { cwd: f.root, id: "finish" } },
    { type: "event_msg", timestamp: "2026-01-01T00:00:15.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 20, output_tokens: 2 } } } },
  ].map((row) => JSON.stringify(row)).join("\n"));
  const now = "2026-01-01T00:00:20.000Z";
  const stats = collectDashboard(f.repo, f.ref, { home, env: {}, now, finishing: true });
  assert.equal(stats.project.durationMs, 20000); assert.equal(stats.project.finish, now);
  assert.equal(stats.project.gateFailures, 0);
  assert.equal(stats.tokens.find((t) => t.tool === "Codex")!.usage.input, 20);
  assert.deepEqual(stats.reviews, []); assert.deepEqual(stats.improvements, []);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "# close\n\n## 회고\n\nkeep\n");
  refreshProjectMetrics(f.repo, f.ref, { home, env: {}, now, finishing: true });
  const close = readFileSync(join(f.dir, "METRICS.md"), "utf8");
  assert.match(close, /\| 러닝 시간 \| 0\.3분 \|/);
  assert.match(close, /\| 작업자 \| Codex \| 20 \| 0 \| 0 \| 2 \|/);
});

test("metrics report: linked close document is rejected without copying external text", () => {
  const f = fixture(); const home = tempDir(); const outside = join(tempDir(), "outside.md");
  const raw = "# PRIVATE_EXTERNAL_DOCUMENT\n\n## 회고\n\nprivate original\n";
  writeFileSync(outside, raw); const closePath = join(f.dir, "PROJECT-CLOSE.md"); symlinkSync(outside, closePath);
  const state = readFileSync(join(f.dir, "PROJECT.md"), "utf8");
  assert.throws(() => refreshProjectMetrics(f.repo, f.ref, { home, env: {} }), /일반 파일/);
  assert.ok(lstatSync(closePath).isSymbolicLink());
  assert.equal(readFileSync(outside, "utf8"), raw);
  assert.equal(readFileSync(join(f.dir, "PROJECT.md"), "utf8"), state);
});

test("metrics report: linked project directory components are rejected", () => {
  for (const parent of [false, true]) {
    const f = fixture();
    writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "# external document\n");
    const source = parent ? join(f.root, "projects") : f.dir;
    const target = join(tempDir(), "moved"); renameSync(source, target); symlinkSync(target, source);
    assert.throws(() => refreshProjectMetrics(f.repo, f.ref, { home: tempDir(), env: {} }), /일반 파일/);
    assert.ok(lstatSync(source).isSymbolicLink());
  }
});


test("metrics report: close summary requires local link and one to three lines", () => {
  assert.equal(metricsSummaryIssues("## 지표\n[집계](METRICS.md)\n\n질의 대기가 없었다.\n").length, 0);
  for (const text of ["", "## 지표\n[집계](METRICS.md)\n", "## 지표\n해석만\n", "## 지표\n[집계](METRICS.md)\na\nb\nc\nd\n", "## 지표\n[집계](METRICS.md)\n| 표 |\n"]) assert.ok(metricsSummaryIssues(text).length);
});

test("metrics report: outside task, proportions, empty tools, counts and total elapsed", () => {
  const f = fixture(); const home = tempDir();
  const at = (n: number) => new Date(Date.UTC(2026,0,1,0,0,n)).toISOString();
  for (const [cmd,n,task] of [["start",0],["task",10,"T01"],["done",30,"T01"],["task",40,"T02"],["done",50,"T02"],["finish",60],["merge",80]] as const) recordMetric(f.dir,{ts:at(n),project:"P001",cmd,task,ok:true});
  const event = (type: "question" | "answer" | "review" | "change", n: number, t?: string, data?: Record<string,number>) => recordEvent(f.dir,{ts:at(n),p:"P001",t,type,by:"agent",msg:type,data});
  event("question",20,"T01"); event("answer",25,"T01");
  event("review",26,"T01",{reviewer:1,blocking:2,tester:1,fail:1});
  event("review",56,undefined,{reviewer:1,blocking:3,tester:1,fail:1});
  event("change",27,"T01"); event("change",57);
  recordMetric(f.dir,{ts:at(28),project:"P001",cmd:"check",task:"T01",ok:false,reason:"contract"});
  recordMetric(f.dir,{ts:at(58),project:"P001",cmd:"finish",ok:false,reason:"contract"});
  const git = (...args: string[]) => { const r=spawnSync("git",["-C",f.root,...args],{encoding:"utf8"}); assert.equal(r.status,0,r.stderr); };
  git("init","-q","-b","main"); git("config","user.name","test");git("config","user.email","test@example.com");
  writeFileSync(join(f.root,"one.txt"),"one\n");git("add","one.txt");git("commit","-qm","feat(P001/T01): one");
  writeFileSync(join(f.root,"two.txt"),"two\nthree\n");git("add","two.txt");git("commit","-qm","docs(P001): outside");
  const sessions = join(home,".codex","sessions"); mkdirSync(sessions,{recursive:true});
  writeFileSync(join(sessions,"one.jsonl"),[
    {type:"session_meta",payload:{cwd:f.root,id:"one"}},
    ...[5,20,35,45,55].map(n=>({type:"event_msg",timestamp:at(n),payload:{type:"token_count",info:{total_token_usage:{input_tokens:n*10,output_tokens:n}}}})),
  ].map(r=>JSON.stringify(r)).join("\n"));
  writeFileSync(join(f.dir,"PROJECT-CLOSE.md"),"## 지표\n[집계](METRICS.md)\n해석\n");
  refreshProjectMetrics(f.repo,f.ref,{home,env:{},now:at(100)});
  const text=readFileSync(join(f.dir,"METRICS.md"),"utf8");
  assert.match(text,/\| 병합 승인 대기 \| 0.3분 \|/);
  assert.match(text,/\| 전체 경과 \| 1.3분 \|/);
  assert.match(text,/\| T01 \| 0.3분 \| Codex 15 \(27.3%\)/);
  assert.match(text,/\| 태스크 밖 \| 0.5분 \| Codex 30 \(54.5%\)/);
  assert.ok(!text.includes("Claude Code")); assert.ok(!text.includes("Cursor"));
  assert.match(text,/\| T01 \| Codex \| 150 \|/);
  assert.ok(text.includes("| 질문 / 답변 | 1 / 1 |"));
  mkdirSync(join(f.dir,"tasks"),{recursive:true});
  refreshProjectMetrics(f.repo,f.ref,{home,env:{},now:at(100)});
  assert.ok(readFileSync(join(f.dir,"METRICS.md"),"utf8").includes("| 리뷰 회차 | 2 |"));
  assert.ok(text.includes("| 리뷰 회차 | 2 |")); assert.ok(text.includes("| blocking | 5 |")); assert.ok(text.includes("| tester fail | 2 |"));
  assert.ok(text.includes("| 게이트 실패 | 2 |")); assert.ok(text.includes("| 파일 변경 횟수 / 추가·삭제 행 | 2회 / +3 −0 |"));
  assert.match(text,/\| T01 \| 0.3분 \| Codex 15 \(27.3%\) \| 1 \| 2 \| 1 \| 1 \| 1 \| 1회 \/ \+1 −0 \|/);
  assert.match(text,/\| 태스크 밖 \| 0.5분 \| Codex 30 \(54.5%\) \| 1 \| 3 \| 1 \| 1 \| 1 \| 1회 \/ \+2 −0 \|/);
});

test("metrics report: generated metrics symlink is rejected without replacing it", () => {
  const f=fixture(); const outside=join(tempDir(),"private.md");writeFileSync(outside,"PRIVATE");
  writeFileSync(join(f.dir,"PROJECT-CLOSE.md"),"# close"); symlinkSync(outside,join(f.dir,"METRICS.md"));
  assert.throws(()=>refreshProjectMetrics(f.repo,f.ref,{home:tempDir(),env:{}}),/一般|일반 파일/);
  assert.equal(readFileSync(outside,"utf8"),"PRIVATE"); assert.ok(lstatSync(join(f.dir,"METRICS.md")).isSymbolicLink());
});
