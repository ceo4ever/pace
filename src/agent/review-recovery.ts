import type { ReviewEntry } from "./review-log.ts";
import type { BudgetStage } from "./review-budget.ts";

export type RecoveryProof = {
  id: string;
  at: string;
  stage: BudgetStage;
  target: string;
  hash: string;
  evidence: string;
  evidence_hash: string;
  summary: string;
};

export type FindingKey = { id: string; location: string };

export type FocusedCheck = RecoveryProof & {
  type: "focused_check";
  source: string;
  finding: FindingKey;
  impact: string;
  diagnosed: boolean;
  contract: string;
};

export type RootReview = RecoveryProof & {
  type: "root_review";
  trigger: string;
  slot: 1 | 2;
  reviewer: string;
  provider: string;
  context: string;
  cross: boolean;
  cross_unavailable?: string;
  contract: string;
};

export type RootCheck = RecoveryProof & {
  type: "root_check";
  root_review: string;
  impact: string;
  contract: string;
};

export type ContractReset = RecoveryProof & {
  type: "contract_reset";
  trigger: string;
  contract: string;
  offsets: Record<string, number>;
  finish: boolean;
  root_review?: string;
};

export type RecoveryEvent = FocusedCheck | RootReview | RootCheck | ContractReset;

export type CompletedCheck = { grant: FocusedCheck | RootCheck; result: ReviewEntry };

export function sameFinding(a: FindingKey, b: FindingKey): boolean {
  return a.id === b.id && a.location === b.location;
}

export function readRecovery(events: readonly RecoveryEvent[], results: readonly ReviewEntry[]) {
  const confirmations = events.filter((entry): entry is FocusedCheck => entry.type === "focused_check");
  const rootReviews = events.filter((entry): entry is RootReview => entry.type === "root_review");
  const rootChecks = events.filter((entry): entry is RootCheck => entry.type === "root_check");
  const resets = events.filter((entry): entry is ContractReset => entry.type === "contract_reset");
  function result(grant: FocusedCheck | RootCheck) {
    return results.findLast((row) => row.followup?.id === grant.id && row.hash === grant.hash &&
      row.structured_stage === grant.stage &&
      row.followup.type === (grant.type === "focused_check" ? "confirmation" : "upper") &&
      (row.verdict === "pass" || row.verdict === "fail") && !row.interrupted);
  }
  const completed = confirmations.flatMap((grant) => {
    const row = result(grant);
    return row ? [{ grant, result: row }] : [];
  });
  const ordinary = completed.filter(({ grant }) => !grant.diagnosed);
  const diagnosed = completed.filter(({ grant }) => grant.diagnosed);
  const latestDiagnostic = diagnosed.at(-1);
  const trigger = latestDiagnostic?.result.verdict === "fail" &&
    !resets.some((reset) => reset.trigger === latestDiagnostic.grant.id && reset.finish) ? latestDiagnostic : undefined;
  const checkFor = (review: RootReview) => rootChecks.findLast((check) => check.root_review === review.id);

  function upperPhase() {
    if (!trigger) return null;
    let failed = trigger.result;
    let contract = trigger.grant.contract;
    for (const slot of [1, 2] as const) {
      const review = rootReviews.find((row) => row.trigger === trigger.grant.id && row.slot === slot);
      if (!review) return { action: "upper_review", slot, trigger, failed, contract } as const;
      const grant = checkFor(review);
      const outcome = grant && result(grant);
      if (!outcome) return { action: "upper_recheck", slot, trigger, failed, contract, review, grant } as const;
      if (outcome.verdict === "pass") return null;
      failed = outcome;
      contract = grant!.contract;
    }
    return { action: "agreement_required", trigger, failed, contract } as const;
  }
  const upperResults = rootChecks.flatMap((grant) => {
    const row = result(grant);
    return row ? [{ grant, result: row }] : [];
  });
  return { confirmations, completed, ordinary, diagnosed, rootReviews, upperResults, resets, upper: upperPhase() };
}
