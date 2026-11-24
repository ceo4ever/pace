import { closeSync, constants, mkdirSync, renameSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { parentPort } from "node:worker_threads";
import { hasTokenShape } from "../secrets.ts";
import { registeredWorkspaceRoot, sameWorkspaceRoot, type WorkspaceRoot } from "../workspace.ts";

// 조회 워커 본체 — 차단될 수 있는 파일 작업(열기·stat·realpath·읽기)은 메인 이벤트 루프 밖에서 한다.
// 시험 훅은 환경변수 PACE_TELEGRAM_FSWORKER_TEST(JSON)로만 켠다: { hang: "root"|"read"|"validate", swapAfterOpen: { file, target } }

interface Hooks { hang?: string; swapAfterOpen?: { file: string; target: string }; swapRootAfterOpen?: { moved: string } }
const hooks: Hooks = (() => { try { return JSON.parse(process.env.PACE_TELEGRAM_FSWORKER_TEST ?? "{}") as Hooks; } catch { return {}; } })();

function block(): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * 60_000); }
const same = (a: string, b: string): boolean => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
const TOKEN_TAIL = /[0-9A-Za-z_:-]+$/;

interface RegistrationCheck { home: string; registryId: string; root: WorkspaceRoot }
export interface ReadReq { id: number; op: "read"; root: WorkspaceRoot; rel: string; maxBytes: number; maxLines?: number; registration?: RegistrationCheck }
export interface ValidateReq { id: number; op: "validate"; path: string; registration?: RegistrationCheck }
export type Req = ReadReq | ValidateReq;
export type Res = { id: number; ok: true; text: string; truncated: boolean } | { id: number; ok: true; real: string; dev: string; ino: string } | { id: number; ok: false; error: string };

function registrationMatches(check: RegistrationCheck): boolean {
  try { return sameWorkspaceRoot(registeredWorkspaceRoot(check.home, check.root.real, check.registryId), check.root); }
  catch { return false; }
}

function readOp(req: ReadReq): Res {
  if (hooks.hang === "root") block();
  if (req.registration && !registrationMatches(req.registration)) return { id: req.id, ok: false, error: "registry_changed" };
  const rootStat = statSync(req.root.real, { bigint: true });
  if (!rootStat.isDirectory() || String(rootStat.dev) !== req.root.dev || String(rootStat.ino) !== req.root.ino) return { id: req.id, ok: false, error: "root_changed" };
  const target = join(req.root.real, req.rel);
  let real: string;
  try { real = realpathSync.native(target); } catch { return { id: req.id, ok: false, error: "not_found" }; }
  const rel = relative(req.root.real, real);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return { id: req.id, ok: false, error: "outside_root" };
  if (!lstatSync(real).isFile()) return { id: req.id, ok: false, error: "not_file" };
  const fd = openSync(real, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    if (hooks.swapAfterOpen) { try { unlinkSync(hooks.swapAfterOpen.file); symlinkSync(hooks.swapAfterOpen.target, hooks.swapAfterOpen.file); } catch { /* 시험 훅 */ } }
    if (hooks.swapRootAfterOpen) { try { renameSync(req.root.real, hooks.swapRootAfterOpen.moved); mkdirSync(req.root.real); } catch { /* 시험 훅 */ } }
    if (hooks.hang === "read") block();
    const fst = fstatSync(fd, { bigint: true });
    if (!fst.isFile()) return { id: req.id, ok: false, error: "not_file" };
    // 열린 fd가 지금 경로가 가리키는 파일과 같은지 — 열기와 확인 사이의 교체를 따라가지 않는다
    let real2: string;
    try { real2 = realpathSync.native(target); } catch { return { id: req.id, ok: false, error: "changed" }; }
    const st2 = statSync(real2, { bigint: true });
    const rel2 = relative(req.root.real, real2);
    if (!same(real2, real) || st2.dev !== fst.dev || st2.ino !== fst.ino || rel2.startsWith("..") || isAbsolute(rel2)) return { id: req.id, ok: false, error: "changed" };
    const buf = Buffer.alloc(req.maxBytes);
    let n = 0;
    while (n < req.maxBytes) {
      const got = readSync(fd, buf, n, req.maxBytes - n, null);
      if (got === 0) break;
      n += got;
    }
    let text = buf.subarray(0, n).toString("utf8");
    let truncated = false;
    if (n >= req.maxBytes) {
      // 한도에서 잘림 — 마지막 줄바꿈까지로 되돌린다(줄바꿈이 없으면 끝의 토큰 문자 연속을 버린다): 경계에 걸친 토큰 앞부분이 새지 않게
      truncated = true;
      text = text.replace(/�+$/, "");
      const nl = text.lastIndexOf("\n");
      text = nl >= 0 ? text.slice(0, nl) : text.replace(TOKEN_TAIL, "");
    }
    if (req.maxLines !== undefined) {
      const lines = text.split("\n");
      if (lines.length > req.maxLines) { text = lines.slice(0, req.maxLines).join("\n"); truncated = true; }
    }
    // 읽은 뒤 루트가 처음 승인된 디렉터리 그대로인지 다시 확인 — 최초 검사와 열기 사이에 루트를 통째로 바꿔치기한 경우를 거부한다
    const rootAgain = statSync(req.root.real, { bigint: true });
    if (!rootAgain.isDirectory() || String(rootAgain.dev) !== req.root.dev || String(rootAgain.ino) !== req.root.ino) return { id: req.id, ok: false, error: "root_changed" };
    if (req.registration && !registrationMatches(req.registration)) return { id: req.id, ok: false, error: "registry_changed" };
    return { id: req.id, ok: true, text, truncated };
  } finally { closeSync(fd); }
}

function validateOp(req: ValidateReq): Res {
  if (hooks.hang === "validate") block();
  if (req.registration && !registrationMatches(req.registration)) return { id: req.id, ok: false, error: "registry_changed" };
  if (!isAbsolute(req.path)) return { id: req.id, ok: false, error: "not_absolute" };
  let real: string;
  try { real = realpathSync.native(req.path); } catch { return { id: req.id, ok: false, error: "not_found" }; }
  const st = statSync(real, { bigint: true });
  if (!st.isDirectory()) return { id: req.id, ok: false, error: "not_directory" };
  if (hasTokenShape(real) || hasTokenShape(req.path)) return { id: req.id, ok: false, error: "token_shaped_path" };
  return { id: req.id, ok: true, real, dev: String(st.dev), ino: String(st.ino) };
}

parentPort!.on("message", (req: Req) => {
  let res: Res;
  try { res = req.op === "read" ? readOp(req) : validateOp(req); }
  catch (error) { res = { id: req.id, ok: false, error: `io_error:${(error as NodeJS.ErrnoException).code ?? "unknown"}` }; }
  parentPort!.postMessage(res);
});
