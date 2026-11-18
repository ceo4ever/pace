export type ShellExecution = "unavailable" | "passed" | "failed" | "interrupted";
export function shellState(result: { pid?: number; status: number | null; signal: NodeJS.Signals | null; error?: NodeJS.ErrnoException }): { execution: ShellExecution; started: boolean } {
  const limit = result.error?.code === "ETIMEDOUT" || result.error?.code === "ENOBUFS";
  const started = (result.pid ?? 0) > 0 || result.status !== null || result.signal !== null || limit;
  const execution = !started ? "unavailable" : limit || result.error ? "failed" : result.signal ? "interrupted" : result.status === 0 ? "passed" : "failed";
  return { execution, started };
}
