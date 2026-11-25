import type { Measure, TeamMetrics } from "./team-metrics.ts";

const value = (n: number | null) => n === null ? "미확인" : String(n);
const measured = (m: Measure) => `관측 ${value(m.observed)} / 총량 ${value(m.total)} (${m.coverage})`;
const qualityLabels = {
  blocking_sum_stats_events: "blocking 사건",
  blocking_sum_audited: "blocking 감사",
  should_fix_sum_stats_events: "should_fix 사건",
  rereviews_after_fail: "감사 재검토",
  review_failures: "리뷰 실패 사건",
  gate_failures: "게이트 실패",
};
const nonParticipationLabels = {
  "condition-not-triggered": "호출 조건 미발생",
  unconfirmed: "기록 부족(미확인)",
  unused: "실제 미사용",
};
export function formatTeamMetrics(t: TeamMetrics): string {
  const q = t.requests;
  return [
    "## 팀 측정", "",
    `구간: ${t.period.start ?? "시작 미확인"} → ${t.period.end} · ${t.period.unit} · ${t.period.closed ? "닫힘" : "미완료"}`, "",
    `요청 ID별: 도달 관측 ${q.reached} / 총량 ${value(q.reachedTotal)} (사용자 답 ${q.ownerReply}, 사람 경로 성공 ${q.ownerDelivery}) · 실패만 ${q.failedOnly} · 원장 미확인 ${q.unconfirmed} / 비교 미해결 ${q.comparisonUnconfirmed} · 옛 식별자 없음 ${q.legacyUnlinkedEvents}`, "",
    ...(q.attributionUnconfirmed ? [`요청 기록의 귀속 미확인: ${q.attributionUnconfirmed}건 · 전체 도달 총량과 비교 방향 보류`, ""] : []),
    `구간 밖 최초 요청의 구간 내 활동: ${q.crossBoundaryObserved}건${q.crossBoundaryObserved ? "(미확인에 포함, 총량/방향 보류)" : ""}`, "",
    `수신 의도: 사용자 ${q.ownerIntendedRequests} / 코디네이터 ${q.coordinatorIntendedRequests} · 질문 사건 ${q.ownerQuestionEvents}/${q.coordinatorQuestionEvents} · 수신 미상 ${q.recipientUnknownEvents}`, "",
    `전달 실패 시도 관측 ${value(q.failedAttemptsObserved)} · 코디네이터 자체 답 관측 ${value(q.coordinatorOwnAnswerObserved)} · 사용자 개입 총합 미확인(열 중복 가능)`,
    "", "| 구분 | 값 |", "|---|---|",
    ...Object.entries(t.manual).map(([name, m]) => `| 손작업 ${name} | ${measured(m)} |`),
    ...Object.entries(t.normal).map(([name, m]) => `| 정상 배정·승인 ${name} | ${measured(m)} |`),
    ...Object.entries(qualityLabels).map(([key, label]) =>
      `| ${label} | 관측 ${value(t.snapshot.observed_counts[key] ?? null)} / 총량 ${value(t.snapshot.counts[key] ?? null)} |`),
    "", "역할별 신고 관측(성적순 아님):", "",
    ...t.roles.map((r) => `- ${r.name}: 작업 ms ${value(r.workMs)} · 출력 ${r.outputTokens.map((o) => `${o.tool} ${value(o.output)}`).join(", ") || "미확인"} · ${r.source}`),
    "", `cwd 구간 근사(역할 귀속 아님): 작업 ms ${value(t.workerContext.workMs)} · ${t.workerContext.outputs.map((o) => `${o.tool} ${value(o.output)}`).join(", ")}`,
    `소통 종류: ${JSON.stringify(t.handoffs.kinds)} · 구간 말 열린 위임 ${t.handoffs.open.length}`,
    ...Object.entries(t.handoffs.agents).sort(([a], [b]) => a.localeCompare(b)).map(([name, counts]) => `- 소통 ${name}: ${JSON.stringify(counts)}`),
    ...t.unusedRoleCandidates.map((r) => `- 미사용 검토 후보 ${r.role}: ${r.coverage} · ${r.reason}`),
    ...(t.requiredRoleNonParticipation ?? []).map(({ role, status }) => `- 필수 역할 비참여 ${role}: ${nonParticipationLabels[status]}`),
    ...t.warnings.map((warning) => `- 한계: ${warning}`),
  ].join("\n");
}
