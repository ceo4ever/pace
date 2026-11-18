import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkInventory, compareItems, parseEventLines, parseText, profileTotals } from "./measurement-data.ts";

type Item = { name: string; result: string; durationMs?: number };
type Run = { status: number | null; signal: string | null; error?: string; elapsedMs: number; started: string; ended: string; log: string; totals: Record<string, number>; inventory: Item[]; complete: boolean };
type Event = { type: string; name?: string; file?: string; entryFile?: string; line?: number; column?: number; nesting?: number; skip?: boolean | string; todo?: boolean | string; success?: boolean; details?: { type?: string; duration_ms?: number }; counts?: Record<string, number>; duration_ms?: number };
const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const seconds = (ms: number) => (ms / 1000).toFixed(3);
const cell = (value: string) => value.replaceAll("|", "\\|");
export function report(folder: string) {
  const runs = JSON.parse(readFileSync(join(folder, "results.json"), "utf8")) as Run[];
  const summary = JSON.parse(readFileSync(join(folder, "summary.json"), "utf8"));
  const baselineFolder = summary.reusedBaseline ? resolve(root, summary.reusedBaseline) : folder;
  const rawInventories: Item[][] = [];
  const baselineChecks = runs.map((run, index) => {
    try {
      const path = existsSync(run.log) ? run.log : join(baselineFolder, `run-${index + 1}.log`);
      const raw = parseText(readFileSync(path, "utf8"));
      rawInventories[index] = raw.inventory;
      const stored = checkInventory(run.totals, run.inventory);
      const differences = compareItems(raw.inventory, run.inventory);
      const timingDifferences = raw.inventory.flatMap((item, position) => {
        const saved = run.inventory[position];
        const missingRawTime = item.result === "pass" && (!Number.isFinite(item.durationMs) || item.durationMs! < 0);
        return missingRawTime || item.name !== saved?.name || item.result !== saved?.result || item.durationMs !== saved?.durationMs
          ? [{ position, name: item.name, rawMs: item.durationMs ?? null, storedMs: saved?.durationMs ?? null, missingRawTime }] : [];
      });
      const totalsMatch = Object.keys(raw.totals).every((key) => raw.totals[key] === run.totals[key]);
      const valid = run.complete === true && raw.complete && stored.complete && differences.length === 0 && timingDifferences.length === 0 && totalsMatch && run.status === 0 && !run.signal && !run.error && raw.totals.pass! > 0 && raw.totals.fail === 0 && raw.totals.cancelled === 0 && Number.isFinite(run.elapsedMs) && run.elapsedMs > 0;
      return { run: index + 1, valid, path, raw: { totals: raw.totals, observed: raw.observed, problems: raw.problems }, stored, differences, timingDifferences, totalsMatch };
    } catch (error) { return { run: index + 1, valid: false, error: String(error) }; }
  });
  const elapsed = runs.map((run) => run.elapsedMs).toSorted((a, b) => a - b), mid = Math.floor(elapsed.length / 2);
  const expectedMedian = elapsed.length % 2 ? elapsed[mid] : ((elapsed[mid - 1] ?? NaN) + (elapsed[mid] ?? NaN)) / 2;
  const timingSummaryMatches = [expectedMedian, elapsed[0], elapsed.at(-1)].every((value, index) => Number.isFinite(value) && Math.abs(value! - [summary.medianMs, summary.minMs, summary.maxMs][index]) < 0.000001);
  const baselineValid = summary.valid === true && summary.runs === runs.length && runs.length > 0 && timingSummaryMatches && baselineChecks.every((check) => check.valid);
  writeFileSync(join(folder, "baseline-revalidation.json"), JSON.stringify({ valid: baselineValid, timingSummaryMatches, checks: baselineChecks }, null, 2) + "\n");
  const rows = runs.map((run, index) => `| ${index + 1} | ${run.started} | ${(run.elapsedMs / 1000).toFixed(3)} | ${run.status} | ${run.totals.tests} | ${run.totals.pass} | ${run.totals.fail} | ${run.totals.skipped} |`);
  let md = `# Windows 검사 측정

평가 기준은 계측 없는 npm run check의 벽시계 시간이다. 보조 프로파일은 중앙값에 포함하지 않는다.

| 회차 | 시작(UTC) | 경과(초) | 종료 | 시험 | 통과 | 실패 | 건너뜀 |
|---|---|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}

기준 유효: ${baselineValid} (원시 요약·저장 인벤토리 재대조: baseline-revalidation.json).
중앙값 ${seconds(summary.medianMs)}초, 최소 ${seconds(summary.minMs)}초, 최대 ${seconds(summary.maxMs)}초.

환경: environment.json, 회차별 부하: run-N-host.json, 원시 출력: run-N.log, 원시 결과/인벤토리: results.json.
`;
  let profileValid = true;
  md += "\n동시 작업·원래 도구 버전·개인 경로의 공개와 한계는 T01 evidence/measurement-limitations.md를 따른다. 실제 기준 실행 당시 도구 해시나 동시 부하의 영향량을 사후에 확정하지 않는다.\n";
  if (summary.reusedBaseline) {
    const origin = relative(folder, resolve(root, summary.reusedBaseline)).replaceAll("\\", "/");
    md += `\n기준 3회의 환경·회차별 부하·원시 로그는 [원래 기준 실행 폴더](${origin}/)의 environment.json·run-N-host.json·run-N.log를 가리킨다. 현재 폴더의 environment.json은 보조 실행 환경이며 results.json은 원래 기준 결과의 참조를 보존한 복사본이다.\n`;
  }
  const samples = new Map<string, { name: string; occurrence: number; times: number[] }>();
  for (const inventory of rawInventories) {
    if (!baselineValid) break;
    const occurrences = new Map<string, number>();
    for (const item of inventory) {
      const occurrence = (occurrences.get(item.name) ?? 0) + 1;
      occurrences.set(item.name, occurrence);
      if (item.result !== "pass" || !Number.isFinite(item.durationMs)) continue;
      const key = `${item.name}\u0000${occurrence}`;
      const sample = samples.get(key) ?? { name: item.name, occurrence, times: [] };
      sample.times.push(item.durationMs!);
      samples.set(key, sample);
    }
  }
  const normalTests = [...samples.values()].map((sample) => {
    const times = sample.times.toSorted((a, b) => a - b), mid = Math.floor(times.length / 2);
    return { ...sample, medianMs: times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2, minMs: times[0]!, maxMs: times.at(-1)! };
  }).toSorted((a, b) => b.medianMs - a.medianMs);
  writeFileSync(join(folder, "baseline-test-times.json"), JSON.stringify(normalTests, null, 2) + "\n");
  md += `\n## 비계측 정상 시험 시간\n\n원시 기본 로그를 다시 파싱한 정상 판정·개별 시간만 사용한다. 저장 목록의 시간 누락/불일치도 기준 무효로 거부한다. 동일 이름은 등장 순번으로 구분하며 파일 식별자는 기본 출력에 없다. 실패한 보조 표본은 아래 순위에 넣지 않는다. 전체 목록: baseline-test-times.json.\n\n| 시험(등장 순번) | 표본 수 | 중앙값(초) | 최소 | 최대 |\n|---|---:|---:|---:|---:|\n${normalTests.slice(0, 30).map((item) => `| ${cell(item.name)} (#${item.occurrence}) | ${item.times.length} | ${seconds(item.medianMs)} | ${seconds(item.minMs)} | ${seconds(item.maxMs)} |`).join("\n")}\n`;
  const profileLog = join(folder, "profile.log");
  if (existsSync(profileLog)) {
    const parsedEvents = parseEventLines(readFileSync(profileLog, "utf8"));
    const events = parsedEvents.events as unknown as Event[];
    const profile = JSON.parse(readFileSync(join(folder, "profile-summary.json"), "utf8"));
    const fileTimes = events.filter((event) => event.type === "test:summary" && event.file).map((event) => ({ file: relative(root, event.file!), durationMs: event.duration_ms!, counts: event.counts }));
    const inventory = events.filter((event) => event.type === "test:pass" || event.type === "test:fail").map((event) => ({ file: event.file ? relative(root, event.file) : "unconfirmed", entryFile: event.entryFile || event.file ? relative(root, (event.entryFile ?? event.file)!) : "unconfirmed", line: event.line, column: event.column, name: event.name!, kind: event.details?.type, result: event.skip ? "skip" : event.todo ? "todo" : event.type === "test:pass" ? "pass" : "fail", durationMs: event.details?.duration_ms }));
    const total = events.findLast((event) => event.type === "test:summary" && !event.file);
    const comparisons = runs.map((run, index) => {
      const differences = compareItems(run.inventory, inventory);
      const normalized = profileTotals(total?.counts);
      const totalsDifferences = ["tests", "pass", "fail", "skipped", "cancelled", "todo", "suites"].filter((key) => run.totals[key] !== normalized[key]).map((key) => ({ key, baseline: run.totals[key], profile: normalized[key] }));
      return { run: index + 1, differences, totalsMatch: totalsDifferences.length === 0, totalsDifferences };
    });
    const inventoryIntegrity = checkInventory(profileTotals(total?.counts), inventory);
    const fileIntegrity = fileTimes.map((file) => ({ file: file.file, ...checkInventory(profileTotals(file.counts), inventory.filter((item) => item.entryFile === file.file)) }));
    const inventoryFiles = new Set(inventory.map((item) => item.entryFile));
    const filesCovered = fileTimes.length === inventoryFiles.size && new Set(fileTimes.map((file) => file.file)).size === fileTimes.length && fileTimes.every((file) => inventoryFiles.has(file.file));
    const rootSummaries = events.filter((event) => event.type === "test:summary" && !event.file).length;
    const timingsComplete = Number.isFinite(total?.duration_ms) && fileTimes.every((file) => Number.isFinite(file.durationMs) && file.durationMs >= 0) && inventory.every((item) => Number.isFinite(item.durationMs) && item.durationMs! >= 0);
    profileValid = baselineValid && profile.typecheck.status === 0 && profile.profile.status === 0 && total?.success === true && parsedEvents.diagnostics.length === 0 && inventoryIntegrity.complete && fileIntegrity.every((file) => file.complete) && filesCovered && rootSummaries === 1 && timingsComplete && comparisons.every((comparison) => comparison.differences.length === 0 && comparison.totalsMatch);
    const profileData = { auxiliaryOnly: true, valid: profileValid, totals: total?.counts, fileTimes, inventory, comparisons, inventoryIntegrity, fileIntegrity, filesCovered, rootSummaries, timingsComplete, diagnostics: parsedEvents.diagnostics };
    writeFileSync(join(folder, "profile-analysis.json"), JSON.stringify(profileData, null, 2) + "\n");
    md += `\n보조 실행 판정: 종료 ${profile.profile.status}, 통과 ${total?.counts?.passed ?? "미확인"}, 실패 ${total?.counts?.failed ?? "미확인"}, 건너뜀 ${total?.counts?.skipped ?? "미확인"}, 보조 실행 유효 ${profileValid}. 기준 3회의 유효성과 구별한다.\n`;
    md += "\n파일 합계와 벽시계의 간극은 T01의 실제 파일 동시성 1을 전제로 한다. T03에서 병렬 실행한 파일 시간을 합해 같은 간극으로 해석하지 않는다.\n";
    const table = <T>(items: T[], row: (value: T) => string) => items.map(row).join("\n");
    const normalFiles = fileTimes.filter((file) => parsedEvents.diagnostics.length === 0 && file.counts?.failed === 0 && file.counts?.cancelled === 0 && fileIntegrity.some((checked) => checked.file === file.file && checked.complete));
    const abnormalFiles = fileTimes.filter((file) => !normalFiles.includes(file));
    const fileSum = fileTimes.reduce((sum, file) => sum + file.durationMs, 0);
    md += `\n## 보조 관측\n\n명령·파일 집합: profile-arguments.json(기본 실행기의 testArguments 직접 사용). 원시 이벤트: profile.log. 파일·시험 식별자/결과 및 회차별 이름·결과 다중집합 대조: profile-analysis.json. 기본 출력은 파일을 표시하지 않으므로 파일 식별자는 보조 관측에서 얻었다.\n\n타입 검사 ${seconds(profile.typecheck.elapsedMs)}초, 보조 시험 벽시계 ${seconds(profile.profile.elapsedMs)}초, 파일 내부 시간 합계 ${seconds(fileSum)}초. 설명되지 않는 시험 간극 ${seconds(profile.profile.elapsedMs - fileSum)}초(프로세스 기동·수집·파일 로딩 등 포함; 원인별 비중은 추정). 이 분해는 실패 파일도 포함한 해당 보조 실행의 기술적 분해이며 정상 실행 성능 추정치가 아니다. 중첩 시험 시간을 다시 더하지 않는다.\n\n인벤토리 대조: ${comparisons.map((c) => `회차 ${c.run}: 총계 ${c.totalsMatch ? "일치" : "불일치"}, 이름·판정 차이 ${c.differences.length}건`).join("; ")}. 차이는 profile-analysis.json에 전부 보존한다.\n\n### 정상 판정 파일의 보조 시간\n\n단일 보조 관측이다. 실패 파일은 제외하므로 전체 파일의 정상 순위를 확정하는 표가 아니다. 실패 파일의 정상 시간은 비계측 wrapper 시험 시간을 참고하며 파일 시간과 같다고 보지 않는다.\n\n| 파일 | 초 |\n|---|---:|\n${table(normalFiles.toSorted((a, b) => b.durationMs - a.durationMs).slice(0, 20), (file) => `| ${file.file} | ${seconds(file.durationMs)} |`)}\n\n### 실패 또는 미확인 파일의 별도 관측\n\n| 파일 | 초 | 실패 수 |\n|---|---:|---:|\n${table(abnormalFiles, (file) => `| ${file.file} | ${seconds(file.durationMs)} | ${file.counts?.failed ?? "미확인"} |`)}\n\n### 정상 판정 시험의 보조 시간(suite 제외)\n\n| 파일:줄 | 시험 | 초 | 결과 |\n|---|---|---:|---|\n${table(inventory.filter((item) => item.kind !== "suite" && item.result === "pass").toSorted((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0)).slice(0, 30), (item) => `| ${item.file}:${item.line} | ${cell(item.name)} | ${seconds(item.durationMs ?? 0)} | ${item.result} |`)}\n\n### 실패한 시험 표본(정상 순위에서 제외)\n\n| 파일:줄 | 시험 | 관측 초 |\n|---|---|---:|\n${table(inventory.filter((item) => item.result === "fail"), (item) => `| ${item.file}:${item.line} | ${cell(item.name)} | ${seconds(item.durationMs ?? 0)} |`)}\n`;
  }
  writeFileSync(join(folder, "report.md"), md);
  console.log(`Report: ${join(folder, "report.md")}`);
  return baselineValid && profileValid;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: node report.ts <evidence folder>");
  if (!report(resolve(process.argv[2]))) process.exitCode = 1;
}
