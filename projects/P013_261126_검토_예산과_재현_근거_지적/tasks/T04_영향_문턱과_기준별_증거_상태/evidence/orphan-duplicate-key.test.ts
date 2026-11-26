import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeResult, type Executor } from "../../../../../src/agent/contract.ts";
import { ledgerPath, readLedger } from "../../../../../src/agent/review-log.ts";
import { verifyCommand } from "../../../../../src/agent/verify-cli.ts";
import { tempDir } from "../../../../../test/helpers.ts";

test("형식과 기준이 남은 고아 기록의 중복 criteria가 기존 pass로 복구되지 않는다", async () => {
  const root = join(tempDir("pace-t04-orphan-"), "projects/P013_case/tasks/T04_case");
  const target = join(root, "evidence/impl.diff");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(join(root, "TASK.md"), "## 기준\n| T-1 | 결과의 일치 |\n");
  writeFileSync(target, "검토 대상");
  const result = ["```pace-review", JSON.stringify({
    version: 2, findings: [], criteria: [{ id: "T-1", state: "present", observation: "합성 관측" }],
  }), "```", "pass"].join("\n");
  async function verify() {
    const lines: string[] = [];
    const executor: Executor = {
      agent: "codex", mode: "p",
      capabilities: { models: true, effort: false, systemPrompt: false, resume: false, writeAccess: true },
      async run(request) {
        return normalizeResult(request, { text: result, provider: "openai" }, { durationMs: 1, enforcement: "synthetic" });
      },
    };
    const exit = await verifyCommand(["--author-agent", "claude", "--target", target, "--purpose", "합성 고아 복구"], {
      executors: () => [executor], write: (text) => lines.push(text),
    });
    assert.equal(exit, 0);
    return JSON.parse(lines.join(""));
  }
  const first = await verify();
  assert.equal(first.review.verdict, "pass");
  const file = join(dirname(target), first.review.record);
  const stored = JSON.parse(readFileSync(file, "utf8"));
  stored.result.text = result.replace('"criteria":', '"criteria":[],"criteria":');
  writeFileSync(file, JSON.stringify(stored));
  writeFileSync(ledgerPath(target), readLedger(target).filter((row) => row.type !== "review")
    .map((row) => JSON.stringify(row)).join("\n") + "\n");
  writeFileSync(target, "다음 검토 대상");
  const next = await verify();
  assert.match(next.recovered[0], /중단으로 원장에 복구/);
  assert.deepEqual([next.budget.calls, next.budget.rounds, next.review.rereview_of], [2, 1, null]);
});
