import { teamMarkdown } from "./team-markdown.ts";
import { HandoffError } from "./handoff-files.ts";
import type { ProjectEvent } from "./event-log.ts";

type TeamMarkerState = { state: "active" | "absent" } | { state: "invalid"; reason: string };

/** The same document projection serves both the current contract and archival lookup. */
export function inspectTeamMarker(project: string): TeamMarkerState {
  if (![...project.matchAll(/^- 팀 측정:[ \t]*([^\r\n]*)$/gm)].some((m) => m[1]?.replace(/<!--.*?-->/g, "").trim() && !m[1]!.replace(/<!--.*?-->/g, "").trim().startsWith("<!--"))) return { state: "absent" };
  const active: string[] = []; let ambiguousHeader = false, ambiguity: string | undefined;
  for (const line of teamMarkdown(project, "header", (message) => { ambiguity ??= message; }).split("\n")) {
    if (line === "<!-- unsupported indented heading -->") ambiguousHeader = true;
    if (/^ {0,3}#{2,6}(?:[ \t]|$)/.test(line)) break;
    const marker = /^- 팀 측정:[ \t]*([^\r\n]*)$/.exec(line)?.[1]?.trim();
    if (marker) active.push(marker);
  }
  if (active.length && ambiguity) return { state: "invalid", reason: ambiguity };
  if (active.length && ambiguousHeader) return { state: "invalid", reason: "팀 측정 머리의 제목은 열0에 쓴다: 목록 안/들여쓴 제목을 일반 텍스트로 정리한다" };
  if (active.length > 1 || active.some((m) => m !== "v1")) return { state: "invalid", reason: "팀 측정 marker 중복/미지원 버전" };
  return { state: active.length === 1 ? "active" : "absent" };
}

export function teamMarker(project: string): boolean {
  const marker = inspectTeamMarker(project);
  if (marker.state === "invalid") throw new HandoffError(marker.reason);
  return marker.state === "active";
}
/** Same predicate for working files, required retrospective, and the Git merge target. */
export function hasTeamContract(projectId: string, document: string, measurement: boolean, events: readonly ProjectEvent[]): boolean {
  return teamMarker(document) || measurement || events.some((e) => e.p === projectId && e.type === "start" && e.data?.teamMetricsVersion === 1);
}
