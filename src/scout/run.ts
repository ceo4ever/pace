import { join, resolve } from "node:path";
import { today } from "../core/fsutil.ts";
import { createBacklogDir, newBacklog } from "../project/backlog.ts";
import { HarnessError, openRepo } from "../project/harness.ts";

export interface ScoutRun {
  dir: string;
  /** 기본 위치(backlogs/)를 쓰지 못해 대체 위치를 쓴 이유. 기본 위치나 --out이면 없다. */
  fallback?: string;
}

/**
 * 탐색 실행 폴더를 만든다(D4). main 체크아웃이면 backlogs/에 백로그 규칙대로,
 * git이 아니거나 main이 아니면 $PACE_HOME/scout/에 같은 이름 규칙으로(U5), --out이면 그 아래에.
 */
export function newRun(cwd: string, topic: string, options: { home: string; out?: string; date?: string }): ScoutRun {
  // 주제 끝의 "기회"·"기회 탐색"은 겹치지 않게 뗀다(앞의 "사업"은 뜻이라 남긴다).
  const base = topic.trim().replace(/\s*기회(\s*탐색)?$/, "").trim();
  const name = base ? `${base} 기회 탐색` : "기회 탐색";
  const date = options.date ?? today();
  if (options.out) return { dir: createBacklogDir(resolve(cwd, options.out), name, date) };
  let reason: string;
  try {
    const repo = openRepo(cwd);
    if (!repo.inWorktree && repo.branch === repo.base) return { dir: newBacklog(repo, name, date) };
    reason = repo.inWorktree ? `main 체크아웃이 아닌 worktree(${repo.branch})다` : `main이 아닌 브랜치(${repo.branch})다`;
  } catch (error) {
    if (!(error instanceof HarnessError)) throw error;
    // git 내부 오류 원문은 여러 줄이라 사용자에게 전할 한 줄로 줄인다.
    reason = error.message === "git 저장소가 아니다" ? error.message : "git 상태를 읽지 못했다(커밋 없음 등)";
  }
  return { dir: createBacklogDir(join(options.home, "scout"), name, date), fallback: reason };
}
