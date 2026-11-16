import type { Redactor } from "../secrets.ts";

// Telegram Bot API 클라이언트 — fetch만 쓴다(런타임 의존성 0). 기준 URL은 주입(시험은 로컬 모의 서버).
// - 일반 호출은 전체 30초 마감(429 retry_after 대기 포함), 개별 fetch는 15초. 롱폴링은 서버 timeout + 여유.
// - 오류·로그에서 토큰을 제거한다(URL 경로·메시지·cause 모두).
// - 확정 실패(definite)와 결과 불명(시간 초과·연결 끊김·5xx)을 구분해 `/new` 같은 변경 호출의 복구에 쓴다.

export class TelegramApiError extends Error {
  readonly code: number;
  readonly retryAfter?: number;
  /** true면 서버가 명시적으로 거부한 것(요청이 적용되지 않았다). false면 적용 여부를 알 수 없다 */
  readonly definite: boolean;
  constructor(message: string, code: number, definite: boolean, retryAfter?: number) {
    super(message);
    this.name = "TelegramApiError";
    this.code = code;
    this.definite = definite;
    this.retryAfter = retryAfter;
  }
}

export interface ApiOptions {
  token: string;
  base?: string;
  fetchImpl?: typeof fetch;
  redact: Redactor;
  /** 개별 fetch 기한(ms) */
  perCallMs?: number;
  /** 호출 전체 마감(ms) — 429 대기 포함 */
  totalMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new TelegramApiError("중단됨", 0, false));
  const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  const onAbort = (): void => { clearTimeout(t); reject(new TelegramApiError("중단됨", 0, false)); };
  signal?.addEventListener("abort", onAbort, { once: true });
});

export class TelegramApi {
  private readonly o: ApiOptions;
  private readonly stop = new AbortController();
  constructor(options: ApiOptions) { this.o = options; }

  /** 진행 중 호출과 대기를 모두 중단한다(어댑터 정지) */
  abort(): void { this.stop.abort(); }
  get aborted(): boolean { return this.stop.signal.aborted; }

  private scrub(text: string): string {
    let out = this.o.redact(text);
    if (this.o.token) out = out.split(this.o.token).join("[비밀 제거됨]");
    return out;
  }

  private url(method: string): string {
    return `${(this.o.base ?? "https://api.telegram.org").replace(/\/+$/, "")}/bot${this.o.token}/${method}`;
  }

  /** JSON 호출. longPollSeconds가 있으면 롱폴링(서버 대기 시간 + 여유가 기한) */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}, opts: { longPollSeconds?: number } = {}): Promise<T> {
    return this.request<T>(method, () => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(params) }), opts);
  }

  /** multipart 호출(sendDocument) */
  async form<T = unknown>(method: string, make: () => FormData): Promise<T> {
    return this.request<T>(method, () => ({ headers: {}, body: make() }), {});
  }

  private async request<T>(method: string, build: () => { headers: Record<string, string>; body: string | FormData }, opts: { longPollSeconds?: number }): Promise<T> {
    const now = this.o.now ?? Date.now;
    const sleep = this.o.sleep ?? defaultSleep;
    const f = this.o.fetchImpl ?? fetch;
    const longMs = opts.longPollSeconds === undefined ? 0 : opts.longPollSeconds * 1000 + 15_000;
    const perCall = longMs || (this.o.perCallMs ?? 15_000);
    const total = longMs || (this.o.totalMs ?? 30_000);
    const deadline = now() + total;
    for (let attempt = 0; ; attempt++) {
      if (this.stop.signal.aborted) throw new TelegramApiError("어댑터가 정지했다", 0, false);
      const remaining = deadline - now();
      if (remaining <= 0) throw new TelegramApiError(`${method} 호출 마감 초과`, 0, false);
      const signal = AbortSignal.any([this.stop.signal, AbortSignal.timeout(Math.min(perCall, remaining))]);
      let res: Response;
      try {
        const { headers, body } = build();
        res = await f(this.url(method), { method: "POST", headers, body, signal });
      } catch (error) {
        // 연결 실패·시간 초과 — 요청이 적용됐는지 알 수 없다
        throw new TelegramApiError(this.scrub(`${method} 호출 실패: ${(error as Error).name === "TimeoutError" || (error as Error).name === "AbortError" ? "시간 초과·중단" : String((error as Error).message ?? error)}`), 0, false);
      }
      type Reply = { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };
      let json: Reply | null = null;
      try { json = (await res.json()) as Reply; } catch { json = null; }
      if (json && json.ok === true) return json.result as T;
      const code = json?.error_code ?? res.status;
      const description = this.scrub(String(json?.description ?? `HTTP ${res.status}`));
      if (code === 429 && attempt < 3) {
        const waitMs = Math.max(0, (json?.parameters?.retry_after ?? 1) * 1000);
        if (waitMs <= deadline - now()) {
          try { await sleep(waitMs, this.stop.signal); } catch { throw new TelegramApiError("어댑터가 정지했다", 0, false); }
          continue;
        }
      }
      // 5xx·본문 없는 응답은 결과 불명, 4xx(+ok:false)는 명시적 거부
      const definite = json !== null && code >= 400 && code < 500;
      throw new TelegramApiError(`${method}: ${description}`, code, definite, json?.parameters?.retry_after);
    }
  }
}
