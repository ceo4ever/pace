import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../../../..");
const { verifyCommand } = await import(resolve(root,"src/agent/verify-cli.ts"));
const { createPExecutor, claudeP } = await import(resolve(root,"src/agent/p-executor.ts"));
const adapter = {
  ...claudeP,
  build(request) {
    const launch = claudeP.build(request);
    const tools = launch.args.indexOf("--tools");
    if (tools < 0) throw new Error("The read-only tool argument is required");
    launch.args[tools + 1] = "";
    launch.args.push("--setting-sources", "", "--no-session-persistence");
    return launch;
  },
};
process.exitCode = await verifyCommand([
  "--kind", "task", "--author-agent", "codex", "--target", resolve(import.meta.dirname,"../TASK.md"),
  "--purpose-file", resolve(import.meta.dirname,"task-purpose.txt"),
  "--out", resolve(import.meta.dirname,"../pre-review-output-r2.json"), "--timeout-ms","360000",
],{ executors: () => [createPExecutor(adapter,{command:"/Users/lucas/.local/bin/claude"})], write: (text) => process.stdout.write(text) });
