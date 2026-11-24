import { spawn } from "node:child_process";

// Private IPC bridge: the wrapper records this process group before sending START.
// No user command can run in the pre-record crash window.
let started = false;
process.on("disconnect", () => { if (!started) process.exit(2); });
process.on("message", (message: unknown) => {
  if (started || !message || typeof message !== "object") return;
  const data = message as { type?: unknown; argv?: unknown };
  if (data.type !== "START" || !Array.isArray(data.argv) || data.argv.length === 0 || !data.argv.every((arg) => typeof arg === "string")) return;
  started = true;
  const [command, ...args] = data.argv as string[];
  try {
    const child = spawn(command!, args, { stdio: "inherit", shell: false, detached: false });
    child.once("error", () => process.exit(127));
    child.once("exit", (code, signal) => {
      if (process.connected) process.send?.({ type: "EXIT", code, signal });
      process.exit(code === null ? 1 : code);
    });
  } catch { process.exit(127); }
});
process.send?.({ type: "READY" });
