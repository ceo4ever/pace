import type { BudgetStatus } from "./review-budget.ts";

export interface AdmissionState {
  budget: Pick<BudgetStatus, "exhausted" | "rounds">;
  pending: boolean;
  latestVerdict: "pass" | "fail" | null;
  jointAttempts: number;
  jointRecorded: boolean;
  ownerRounds: number | null;
}

/** 예산, 판정, 결정 원장의 현재 상태로만 다음 검토를 고른다. */
export function decideReviewAdmission(state: AdmissionState) {
  const { budget } = state;
  if (state.pending) return { kind: "owner_pending", canJoint: false } as const;
  if (state.ownerRounds !== null) {
    return { kind: state.ownerRounds > 0 ? "owner" : "exhausted", canJoint: false } as const;
  }
  if (!budget.exhausted) return { kind: "ordinary", canJoint: false } as const;

  const firstVerdictMissing = budget.exhausted === "calls" && state.latestVerdict === null;
  const canJoint = state.jointAttempts < 2 && state.latestVerdict !== "pass" &&
    (budget.rounds >= 2 || firstVerdictMissing);
  if (!canJoint || !state.jointRecorded) return { kind: "exhausted", canJoint } as const;
  return { kind: "joint", canJoint, firstReview: firstVerdictMissing } as const;
}
