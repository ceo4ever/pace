import { randomInt } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";
import { realpathSync } from "node:fs";
import { type ProjectEvent, recordEvents } from "../project/event-log.ts";
import { createDir, gitRead } from "../project/handoff-files.ts";
import { openRepo, projectWorktreeMainRoot } from "../project/harness.ts";
import { readTeamEvents } from "../project/team-input.ts";
import { commonGitDirectory } from "../team/resource-lock.ts";
import { safeTeamPath } from "../team/store.ts";
import { safePath } from "./map.ts";
import type { TestObservation } from "./execute.ts";

const threshold = 2;
const resultCode = { passed: 1, failed: 2, unknown: 3 };
const eventMessage = "선택 시험 파일 결과";

function worktreeMeta(root: string): string {
  const result = gitRead(root, ["rev-parse", "--absolute-git-dir"]);
  const path = result.stdout.replace(/\r?\n$/, "");
  const worktrees = safeTeamPath(commonGitDirectory(root), "worktrees", true);
  if (result.status !== 0 || !isAbsolute(path) || realpathSync.native(dirname(path)) !== realpathSync.native(worktrees)) {
    throw new Error("시험 이력 worktree 경로를 확인할 수 없다");
  }
  return safeTeamPath(worktrees, basename(path), true);
}

/** 선택 관측은 worktree의 Git 폴더에만 남긴다. 기록 실패는 검사 결과를 바꾸지 않는다. */
export function recordTestSignals(root: string, observations: readonly TestObservation[]): string {
  if (!observations.length) return "";
  try {
    const repo = openRepo(root);
    const project = /^project\/(P\d{3})$/.exec(repo.branch)?.[1];
    if (!project || !repo.inWorktree || !projectWorktreeMainRoot(repo.root)) return "";
    const dir = createDir(worktreeMeta(repo.root), "pace/test-signals");
    const byFile = new Map<string, TestObservation["verdict"]>();
    for (const { file, verdict } of observations) {
      const relative = safePath(file);
      const prior = byFile.get(relative);
      byFile.set(relative, prior !== undefined && prior !== verdict ? "unknown" : verdict);
    }
    const attempt = randomInt(1, 2 ** 47);
    const ts = new Date().toISOString();
    const events: ProjectEvent[] = [...byFile].map(([ref, verdict]) => ({
      p: project, ts, type: "note", by: "cli", msg: eventMessage, ref,
      data: { testResult: resultCode[verdict], testAttempt: attempt },
    }));
    readTeamEvents(dir, project); // refuse corrupt, linked or oversized history before appending
    if (!recordEvents(dir, events)) return "";
    const history = readTeamEvents(dir, project) ?? [];
    return [...byFile].flatMap(([file, verdict]) => {
      if (verdict !== "failed") return [];
      const rows = history.filter((item) => item.ref === file && item.type === "note" && item.by === "cli" &&
        item.msg === eventMessage && item.data?.testAttempt !== undefined);
      const index = rows.findIndex((item) => item.data?.testAttempt === attempt);
      if (index < threshold - 1) return [];
      const prior = rows[index - threshold];
      const streak = rows.slice(index - threshold + 1, index + 1);
      if (prior?.data?.testResult === resultCode.failed || streak.some((item) => item.data?.testResult !== resultCode.failed)) return [];
      return [`\n문제 해결 호출 권고: ${JSON.stringify({
        kind: "test_failures", unit: { kind: "test_file", ref: file }, evidence: streak.map((item) => item.data!.testAttempt),
      })}\n`];
    }).join("");
  } catch { return ""; }
}
