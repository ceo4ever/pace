import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tempDir } from "../../../../../test/helpers.ts";
import { verifyCommand } from "../../../../../src/agent/verify-cli.ts";
import { normalizeResult, type Executor } from "../../../../../src/agent/contract.ts";
import { ledgerPath, readLedger, textHash } from "../../../../../src/agent/review-log.ts";
const finding = { id:"F1", severity:"blocking", category:"defect", location:"src/report.ts:12-14, src/read.ts:6", scenario:"빈 보고서가 사라진다", reproduction:"빈 보고서를 저장하고 다시 연다", confidence:"high" };
const structured = (items: unknown[], footer = "pass") => ["```pace-review", JSON.stringify({version:1, findings:items}), "```", footer].join("\n");
function fixture() {
  const target = join(tempDir("pace-r3-probe-"), "projects/P013_case/tasks/T03_case/evidence/impl.diff");
  mkdirSync(dirname(target), { recursive:true }); writeFileSync(target, "대상 1\n");
  const prompts: string[] = [];
  async function verify(text: string) {
    let output = "";
    const executor: Executor = { agent:"codex", mode:"p", capabilities:{models:true,effort:true,systemPrompt:false,resume:false,writeAccess:true},
      async run(request) { prompts.push(request.prompt); return normalizeResult(request, {text, provider:"openai"}, {durationMs:1,enforcement:"fake"}); } };
    const code = await verifyCommand(["--author-agent","claude","--target",target,"--purpose","상위 목적"], {executors:()=>[executor],write:(s)=>{output+=s;}});
    return {code, output:JSON.parse(output)};
  }
  return {target,prompts,verify};
}
const results: unknown[] = [];
for (const orphan of [true,false]) for (const removal of ["none","stage","both","legacy","normal"] as const) {
  const h=fixture();
  const first=await h.verify(structured(removal === "legacy" ? [] : [finding]));
  const recordPath=join(dirname(h.target),first.output.review.record);
  const record=JSON.parse(readFileSync(recordPath,"utf8"));
  const entries=readLedger(h.target);
  if (removal !== "normal") record.review.verdict="pass";
  if (["stage","both","legacy"].includes(removal)) delete record.review.structured_stage;
  if (["both","legacy"].includes(removal)) delete record.assessment;
  if (removal === "legacy") record.result.text="옛 검토 기록\npass";
  for (const row of entries) if (row.type === "review") {
    if (removal !== "normal") row.verdict="pass";
    if (["stage","both","legacy"].includes(removal)) delete row.structured_stage;
    if (removal === "legacy") row.result_hash=textHash(record.result.text);
  }
  writeFileSync(recordPath,JSON.stringify(record));
  writeFileSync(ledgerPath(h.target),entries.filter(row=>!orphan || row.type!=="review").map(row=>JSON.stringify(row)).join("\n")+"\n");
  writeFileSync(h.target,"대상 2\n");
  const next=await h.verify(structured([]));
  const rows=readLedger(h.target).filter(row=>row.type === "review");
  const bad=!["normal","legacy"].includes(removal);
  if (bad && orphan) {
    assert.equal(next.code,0); assert.equal(rows[0].interrupted,true);
    assert.equal(next.output.review.rereview_of,null);
    assert.deepEqual([next.output.budget.calls,next.output.budget.rounds],[2,1]);
  } else if (bad) {
    assert.equal(next.code,2); assert.equal(h.prompts.length,1);
    assert.match(next.output.error.message,/기준점의 (단계|판정)/);
  } else {
    assert.equal(next.code,0); assert.equal(next.output.review.rereview_of,first.output.review.record);
    assert.deepEqual([next.output.budget.calls,next.output.budget.rounds],[2,2]);
    if (removal === "normal") assert.match(h.prompts.at(-1)!,/F1 \[blocking\]/);
    else assert.match(h.prompts.at(-1)!,/직전 판정은 pass/);
  }
  results.push({orphan,removal,first_verdict:first.output.review.verdict,code:next.code,recovered:next.output.recovered,error:next.output.error,budget:next.output.budget,rereview_of:next.output.review?.rereview_of,prompt_count:h.prompts.length,recovered_row:rows[0]});
}
for (const removal of ["stage","both"]) {
  const h=fixture();
  const malformed=["```pace-review", '{"version":1,"findings":[],"findings":[]}', "```", "pass"].join("\n");
  const first=await h.verify(malformed);
  assert.equal(first.output.review.verdict,"unknown");
  const path=join(dirname(h.target),first.output.review.record);
  const record=JSON.parse(readFileSync(path,"utf8"));
  record.review.verdict="pass"; delete record.review.structured_stage;
  if (removal === "both") delete record.assessment;
  writeFileSync(path,JSON.stringify(record));
  writeFileSync(ledgerPath(h.target),readLedger(h.target).filter(row=>row.type!=="review").map(row=>JSON.stringify(row)).join("\n")+"\n");
  writeFileSync(h.target,"대상 2\n");
  const next=await h.verify(structured([]));
  const row=readLedger(h.target).find(row=>row.type === "review");
  assert.equal(next.code,0); assert.equal(row?.type === "review" && row.interrupted,true);
  assert.deepEqual([next.output.budget.calls,next.output.budget.rounds,next.output.review.rereview_of],[2,1,null]);
  results.push({orphan:true,removal,initial_structure:"duplicate keys",first_verdict:first.output.review.verdict,code:next.code,recovered:next.output.recovered,budget:next.output.budget,rereview_of:next.output.review.rereview_of});
}
console.log(JSON.stringify(results,null,2));
