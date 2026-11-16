import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import type { Repo } from "./harness.ts";

export function assertComparisonDestination(repo: Repo): void {
  const root = join(repo.root,"projects");
  if (!lstatSync(root).isDirectory()) throw new Error("지표 비교 대상은 일반 디렉터리여야 한다");
  try { if (!lstatSync(join(root,"METRICS.md")).isFile()) throw new Error("일반 파일"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("지표 비교 대상은 일반 파일이어야 한다"); }
}
/** Rebuild from the latest committed/generated project snapshots, without rereading every session. */
export function refreshMetricsIndex(repo: Repo): void {
  assertComparisonDestination(repo);
  const root=join(repo.root,"projects"); const rows: string[]=[];
  for (const folder of readdirSync(root).sort()) {
    if (!/^P\d{3}_/.test(folder) || !lstatSync(join(root,folder)).isDirectory()) continue;
    const path=join(root,folder,"METRICS.md");
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    const text=readFileSync(path,"utf8");
    const value=(name: string) => text.split("\n").find(line=>line.startsWith(`| ${name} |`))?.split("|")[2]?.trim() ?? "기록 없음";
    const tokens=text.split("\n").filter(line=>line.startsWith("| 작업자 |")).map(line=>{const cells=line.split("|").map(s=>s.trim());return `${cells[2]} ${cells[6]}`;}).join(" · ") || "기록 없음";
    const work=value("작업 시간"); const tasks=value("태스크 수");
    const average=work.endsWith("분") && Number(tasks)>0 ? `${(parseFloat(work)/Number(tasks)).toFixed(1)}분` : "기록 없음";
    const label=folder.replaceAll("_"," ").replaceAll("|","\\|");
    rows.push(`| [${label}](<${folder}/METRICS.md>) | ${tasks} | ${work} | ${average} | ${tokens} | ${value("blocking")} | ${value("게이트 실패")} |`);
  }
  writeFileAtomic(join(root,"METRICS.md"),`# 프로젝트 지표 비교\n\n<!-- pace 자동 생성: 직접 편집하지 않음 -->\n\n| 프로젝트 | 태스크 수 | 작업 시간 | 태스크당 작업 시간 | 작업자 출력 토큰 (도구별) | blocking | 게이트 실패 |\n|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\n각 프로젝트 METRICS.md의 마지막 스냅샷을 비교합니다. finish·merge가 다시 만듭니다. 태스크당 작업 시간은 프로젝트 작업 시간÷태스크 수입니다. 기록이 없는 값은 추정하지 않습니다. 시간은 기록된 질의 대기를 뺀 달력 시간이며 프로젝트 규모·기록 누락·도구별 토큰 의미 차이로 생산성 순위를 뜻하지 않습니다.\n`);
}
