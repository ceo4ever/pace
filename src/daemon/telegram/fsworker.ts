import { Worker } from "node:worker_threads";
import type { ReadReq, Res, ValidateReq } from "./fsworker-thread.ts";

// 조회 워커 클라이언트 — 파일 작업을 워커 스레드 한 개에 맡기고 메인은 마감만 기다린다.
// 마감 안에 응답이 없으면 포기하고, 막힌 요청이 끝나기 전까지 새 조회는 "busy"로 거절한다(막힌 작업이 쌓이지 않는다).
// 정지 때는 terminate()를 요청하고 기다리지 않는다(워커는 unref — 막힌 시스템 호출은 프로세스 종료가 정리한다).

export type FsResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: true; real: string; dev: string; ino: string }
  | { ok: false; error: string };

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export class FsWorker {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly waiting = new Map<number, (r: FsResult) => void>();
  /** 마감을 넘겨 포기했지만 워커가 아직 돌려주지 않은 요청 */
  private readonly stuck = new Set<number>();
  private closed = false;

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./fsworker-thread.ts", import.meta.url), { env: process.env });
    w.unref();
    w.on("message", (res: Res) => {
      this.stuck.delete(res.id);
      const fn = this.waiting.get(res.id);
      if (fn) { this.waiting.delete(res.id); fn(res.ok ? (res as FsResult) : { ok: false, error: res.error }); }
    });
    const reset = (): void => {
      if (this.worker !== w) return; // 이전 워커의 늦은 error/exit가 새 워커 상태를 지우지 않게 한다(워커별 멱등)
      this.worker = null;
      this.stuck.clear();
      for (const [, fn] of this.waiting) fn({ ok: false, error: "worker_exit" });
      this.waiting.clear();
    };
    w.on("error", reset);
    w.on("exit", reset);
    this.worker = w;
    return w;
  }

  /** 진행 중이거나 마감을 넘겨 아직 끝나지 않은 요청이 있으면 새 요청을 받지 않는다(동시 1개) */
  get busy(): boolean { return this.stuck.size > 0 || this.waiting.size > 0; }

  async run(req: DistributiveOmit<ReadReq | ValidateReq, "id">, timeoutMs = 5000): Promise<FsResult> {
    if (this.closed) return { ok: false, error: "closed" };
    if (this.busy) return { ok: false, error: "busy" };
    const id = ++this.seq;
    const w = this.ensure();
    return new Promise<FsResult>((resolve) => {
      const timer = setTimeout(() => {
        if (this.waiting.delete(id)) { this.stuck.add(id); resolve({ ok: false, error: "timeout" }); }
      }, timeoutMs);
      timer.unref();
      this.waiting.set(id, (r) => { clearTimeout(timer); resolve(r); });
      w.postMessage({ ...req, id });
    });
  }

  /** 정지 — 기다리지 않는다 */
  terminate(): void {
    this.closed = true;
    const w = this.worker;
    this.worker = null;
    for (const [, fn] of this.waiting) fn({ ok: false, error: "closed" });
    this.waiting.clear();
    this.stuck.clear();
    if (w) void w.terminate().catch(() => undefined);
  }
}
