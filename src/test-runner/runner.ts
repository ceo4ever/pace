import { globSync, lstatSync } from "node:fs";
import { resolve, relative, sep, matchesGlob } from "node:path";
import { openRepo, runDeclaredCheck } from "../project/harness.ts";
import { config, safePath, inside } from "./map.ts";
import type { MapFile, Unit } from "./map.ts";
import { fileResults } from "./execute.ts";
import type { Outcome, TestObservation } from "./execute.ts";
import { executeChanged } from "./changed.ts";
import { recordTestSignals } from "./signals.ts";
const bad = (message: string): never => { throw new Error(message); };

export async function executeTest(cwd: string, args: string[], timeout = 30 * 60_000): Promise<Outcome> {
  if (args.length === 1 && args[0] === "changed") return executeChanged(cwd, timeout);
  try {
    const repo = openRepo(cwd); const root = repo.root; const [mode, arg] = args;
    if (mode === "all" && args.length === 1) {
      const start = Date.now(); const result = runDeclaredCheck(root);
      return { code: result.command === null ? 3 : result.ok ? 0 : 1, text: `전체 검사 · 명령: ${result.command ?? "없음"} · 시간: ${Date.now() - start}ms\n${result.output}` };
    }
    if ((mode !== "file" && mode !== "unit") || args.length !== 2 || !arg) throw new Error("사용법: pace test changed | file <경로> | unit <id> | all");
    let map: MapFile; try { map = config(root); } catch (error) { return bad(`구성 오류: ${(error as Error).message}`); }
    let chosen: Unit[]; let direct: string | undefined;
    if (mode === "file") {
      const target = safePath(arg); const actual = inside(root, resolve(root, target));
      if (!lstatSync(actual).isFile()) return bad("파일이 아니다");
      const rel = relative(root, resolve(root, target)).split(sep).join("/");
      if (map.common.some((p) => matchesGlob(rel, p))) return { code: 3, text: `확인 불가: 공통 경로 ${rel} — 전체 검사 권고` };
      chosen = map.units.filter((u) => [...u.sources, ...u.tests].some((p) => matchesGlob(rel, p)));
      if (!chosen.length) return { code: 3, text: `확인 불가: 미분류 ${rel} — 전체 검사 권고` };
      if (!chosen.some((u) => u.sources.some((p) => matchesGlob(rel, p))) && chosen.some((u) => u.tests.some((p) => matchesGlob(rel, p)))) { direct = rel; chosen = chosen.filter((u) => u.tests.some((p) => matchesGlob(rel, p))); }
    } else { chosen = map.units.filter((u) => u.id === arg); if (!chosen.length) return bad(`없는 단위: ${arg}`); }
    let code = 0; let text = "부분 검사 · 타입·공통·전체 회귀 제외\n";
    const observations: TestObservation[] = [];
    const observe = mode === "file" ? (value: TestObservation) => observations.push(value) : undefined;
    for (const unit of chosen) {
      const allFiles = [...new Set(unit.tests.flatMap((p) => globSync(p, { cwd: root }).map((file) => file.split(sep).join("/"))))].sort();
      const files = direct ? allFiles.filter((f) => f === direct) : allFiles;
      if (!files.length) { code = 1; text += `\n${unit.id}: 선택 파일 없음`; continue; }
      const result = await fileResults(root, unit, files, timeout, false, observe); code = code === 1 || result.code === 1 ? 1 : code === 3 || result.code === 3 ? 3 : 0; text += `\n단위 ${unit.id}: ${result.text}`; if (result.interrupted) break;
    }
    return { code, text: `${text}\n판정: ${code === 0 ? "부분 통과" : code === 3 ? "확인 불가" : "실패"}${recordTestSignals(root, observations)}` };
  } catch (error) { return { code: 1, text: `실패: ${(error as Error).message}` }; }
}
