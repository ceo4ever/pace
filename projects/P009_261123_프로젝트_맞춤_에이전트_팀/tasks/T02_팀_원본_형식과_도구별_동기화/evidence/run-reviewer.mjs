import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../../../..");
const { createPExecutor, claudeP } = await import(resolve(root, "src/agent/p-executor.ts"));
const { runAgent, validateRequest } = await import(resolve(root, "src/agent/contract.ts"));
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error("검토 라벨이 필요하다");
const out = resolve(import.meta.dirname, `impl-review-${label}.json`);
if (existsSync(out)) throw new Error("기존 tester 원문을 덮어쓰지 않는다");
const prior = undefined;
if (prior && !prior.session_id) throw new Error("첫 tester의 세션 재개 ID가 없다");
const adapter = { ...claudeP, build(request) {
  const result = claudeP.build(request);
  result.args.push("--tools", "Read,Grep,Glob");
  return result;
} };
const result = await runAgent(createPExecutor(adapter), validateRequest({
  agent: "claude", mode: "p", cwd: root, access: "read-only", resume: prior?.session_id,
  prompt: readFileSync(resolve(import.meta.dirname, `impl-review-${label}-prompt.txt`), "utf8"), timeoutMs: 300000,
}));
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ model: result.model, stop_reason: result.stop_reason, is_error: result.is_error }));
