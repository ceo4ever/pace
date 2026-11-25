import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../../..");
const first = JSON.parse(readFileSync(resolve(import.meta.dirname, "impl-review-output-78.json"), "utf8"));
const candidate = JSON.parse(readFileSync(resolve(import.meta.dirname, "candidate-r78.json"), "utf8"));
if (first.review?.verdict !== "pass" || first.review.hash !== candidate.patchSha256) {
  throw new Error("The first-stage review must pass for this candidate");
}
const out = resolve(import.meta.dirname, "claude-r78-dynamic.json");
if (existsSync(out)) throw new Error("Preserve the original tester result");
const wrapper = process.argv[2];
if (!wrapper?.startsWith("/")) throw new Error("Provide the Claude launcher");

const { createPExecutor, claudeP } = await import(resolve(root, "src/agent/p-executor.ts"));
const { runAgent, validateRequest } = await import(resolve(root, "src/agent/contract.ts"));
const prompt = readFileSync(resolve(import.meta.dirname, "claude-r78-dynamic-prompt.txt"), "utf8");
const request = validateRequest({ agent: "claude", mode: "p", cwd: root, access: "write", prompt, timeoutMs: 600000 });
const adapter = {
  ...claudeP,
  build(request) {
    const launch = claudeP.build(request);
    launch.args.push("--no-session-persistence", "--tools", "Read,Grep,Glob,Bash", "--allowedTools",
      "Bash(node --test *)", "Bash(git diff *)", "Bash(git status *)", "Bash(jq *)", "Bash(ps -o lstart= -p *)");
    return launch;
  },
};
const result = await runAgent(createPExecutor(adapter, { command: wrapper }), request);
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ model: result.model, provider: result.provider, stop_reason: result.stop_reason, is_error: result.is_error }));
