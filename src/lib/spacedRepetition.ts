// Leitner-box scheduling for individual questions.
//
// Every question sits in a box from 1 to 5. A pass moves it up a box, a fail drops it back to box 1,
// and the box decides how many days until it is due again. A question with no `dueAt` has never been
// reviewed. Pure functions only, so the rules are easy to test and to change.

export type ReviewResult = "PASS" | "FAIL";

export type ReviewState = {
  box: number;
  dueAt: Date | null;
  lastReviewedAt: Date | null;
  lastResult: ReviewResult | null;
};

/** A graded score at or above this counts as a pass. */
export const PASS_THRESHOLD = 70;

/** Days until the next review, indexed by box - 1. */
export const BOX_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export const MAX_BOX = BOX_INTERVAL_DAYS.length;

export const NEW_QUESTION_STATE: ReviewState = {
  box: 1,
  dueAt: null,
  lastReviewedAt: null,
  lastResult: null,
};

export function resultFromScore(score: number): ReviewResult {
  return score >= PASS_THRESHOLD ? "PASS" : "FAIL";
}

/** Midnight at the start of the given day, in the server's local time zone. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  // Calendar arithmetic (not +24h) so daylight-saving changes don't shift the due date.
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * The schedule after one review. Due dates are whole days: a question is due from midnight of its due
 * day, so something answered in the evening is waiting the next morning.
 *
 * - Fail: back to box 1, due tomorrow.
 * - Pass: up one box, unless it was answered before it was due. An early pass leaves the box and the
 *   due date alone, so re-submitting the same answer cannot climb the boxes.
 *
 * `deadline` is the last day of the unit's study plan, if it has one. A review that would land after it
 * is pulled back onto it, so every question comes round once more before the plan ends.
 */
export function nextReviewState(
  current: ReviewState,
  result: ReviewResult,
  reviewedAt: Date,
  deadline?: Date | null,
): ReviewState {
  const today = startOfDay(reviewedAt);
  const capped = (dueAt: Date): Date => {
    if (!deadline) return dueAt;
    const lastDay = startOfDay(deadline);
    return lastDay.getTime() > today.getTime() && dueAt.getTime() > lastDay.getTime() ? lastDay : dueAt;
  };

  if (result === "FAIL") {
    return {
      box: 1,
      dueAt: capped(addDays(today, BOX_INTERVAL_DAYS[0])),
      lastReviewedAt: reviewedAt,
      lastResult: "FAIL",
    };
  }

  const early = current.dueAt !== null && reviewedAt.getTime() < current.dueAt.getTime();
  if (early) {
    return { ...current, lastReviewedAt: reviewedAt, lastResult: "PASS" };
  }

  const box = Math.min(current.box + 1, MAX_BOX);
  return {
    box,
    dueAt: capped(addDays(today, BOX_INTERVAL_DAYS[box - 1])),
    lastReviewedAt: reviewedAt,
    lastResult: "PASS",
  };
}

/** Rebuilds a question's schedule from its past results, oldest first. Used to seed existing history. */
export function replayReviews(events: { at: Date; result: ReviewResult }[]): ReviewState | null {
  if (events.length === 0) return null;
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  return ordered.reduce((state, e) => nextReviewState(state, e.result, e.at), NEW_QUESTION_STATE);
}

export function isDue(state: Pick<ReviewState, "dueAt">, now: Date): boolean {
  return state.dueAt !== null && state.dueAt.getTime() <= now.getTime();
}
