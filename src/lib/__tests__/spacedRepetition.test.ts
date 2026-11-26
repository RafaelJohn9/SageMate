import { describe, expect, it } from "vitest";
import {
  BOX_INTERVAL_DAYS,
  isDue,
  MAX_BOX,
  NEW_QUESTION_STATE,
  nextReviewState,
  PASS_THRESHOLD,
  replayReviews,
  resultFromScore,
  startOfDay,
  type ReviewState,
} from "../spacedRepetition";

// Local-time dates, like the scheduler uses.
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour);
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

describe("resultFromScore", () => {
  it("passes at the threshold and fails just below", () => {
    expect(resultFromScore(PASS_THRESHOLD)).toBe("PASS");
    expect(resultFromScore(PASS_THRESHOLD - 1)).toBe("FAIL");
    expect(resultFromScore(100)).toBe("PASS");
    expect(resultFromScore(0)).toBe("FAIL");
  });
});

describe("nextReviewState", () => {
  it("moves a new question to box 2, due in 3 days, on its first pass", () => {
    const next = nextReviewState(NEW_QUESTION_STATE, "PASS", at(6, 21));
    expect(next.box).toBe(2);
    expect(ymd(next.dueAt)).toBe("2026-11-9");
    expect(next.lastResult).toBe("PASS");
    expect(next.lastReviewedAt).toEqual(at(6, 21));
  });

  it("puts a new question in box 1, due tomorrow, on its first fail", () => {
    const next = nextReviewState(NEW_QUESTION_STATE, "FAIL", at(6));
    expect(next.box).toBe(1);
    expect(ymd(next.dueAt)).toBe("2026-11-7");
    expect(next.lastResult).toBe("FAIL");
  });

  it("makes things due from midnight of the due day, whatever time of day it was answered", () => {
    const morning = nextReviewState(NEW_QUESTION_STATE, "FAIL", at(6, 7));
    const night = nextReviewState(NEW_QUESTION_STATE, "FAIL", at(6, 23));
    expect(morning.dueAt).toEqual(night.dueAt);
    expect(morning.dueAt).toEqual(startOfDay(at(7)));
  });

  it("drops any box back to box 1 on a fail", () => {
    const state: ReviewState = { box: 4, dueAt: at(1), lastReviewedAt: at(1), lastResult: "PASS" };
    const next = nextReviewState(state, "FAIL", at(6));
    expect(next.box).toBe(1);
    expect(ymd(next.dueAt)).toBe("2026-11-7");
  });

  it("walks up through the boxes using each box's interval", () => {
    let state = NEW_QUESTION_STATE;
    const days: number[] = [];
    for (let i = 0; i < 4; i++) {
      const reviewedAt = state.dueAt ?? at(1);
      state = nextReviewState(state, "PASS", reviewedAt);
      days.push(Math.round((state.dueAt!.getTime() - startOfDay(reviewedAt).getTime()) / 86_400_000));
    }
    expect(days).toEqual([3, 7, 14, 30]);
    expect(state.box).toBe(5);
  });

  it("caps at the top box and keeps the longest interval", () => {
    const state: ReviewState = { box: MAX_BOX, dueAt: at(1), lastReviewedAt: at(1), lastResult: "PASS" };
    const next = nextReviewState(state, "PASS", at(6));
    expect(next.box).toBe(MAX_BOX);
    expect(ymd(next.dueAt)).toBe("2026-12-6");
    expect(BOX_INTERVAL_DAYS[MAX_BOX - 1]).toBe(30);
  });

  it("counts a pass on the due day itself as on time", () => {
    const state: ReviewState = { box: 2, dueAt: startOfDay(at(10)), lastReviewedAt: at(7), lastResult: "PASS" };
    expect(nextReviewState(state, "PASS", at(10, 0)).box).toBe(3);
  });

  describe("early reviews", () => {
    const scheduled: ReviewState = { box: 3, dueAt: startOfDay(at(14)), lastReviewedAt: at(7), lastResult: "PASS" };

    it("does not raise the box or move the due date on an early pass", () => {
      const next = nextReviewState(scheduled, "PASS", at(8));
      expect(next.box).toBe(3);
      expect(next.dueAt).toEqual(scheduled.dueAt);
      expect(next.lastReviewedAt).toEqual(at(8));
      expect(next.lastResult).toBe("PASS");
    });

    it("cannot be used to climb by resubmitting the same answer", () => {
      let state = scheduled;
      for (let i = 0; i < 5; i++) state = nextReviewState(state, "PASS", at(8, 9 + i));
      expect(state.box).toBe(3);
    });

    it("still resets the box on an early fail", () => {
      expect(nextReviewState(scheduled, "FAIL", at(8)).box).toBe(1);
    });
  });
});

describe("replayReviews", () => {
  it("returns null when there is no history", () => {
    expect(replayReviews([])).toBeNull();
  });

  it("applies results oldest first regardless of input order", () => {
    const events = [
      { at: at(20), result: "PASS" as const },
      { at: at(1), result: "FAIL" as const },
      { at: at(5), result: "PASS" as const },
    ];
    const state = replayReviews(events)!;
    // FAIL (box 1, due 2nd), PASS on 5th (box 2, due 8th), PASS on 20th (box 3, due 27th)
    expect(state.box).toBe(3);
    expect(ymd(state.dueAt)).toBe("2026-11-27");
    expect(state.lastReviewedAt).toEqual(at(20));
  });

  it("matches applying the same results one by one", () => {
    const first = nextReviewState(NEW_QUESTION_STATE, "PASS", at(2));
    const second = nextReviewState(first, "FAIL", at(9));
    expect(replayReviews([{ at: at(2), result: "PASS" }, { at: at(9), result: "FAIL" }])).toEqual(second);
  });
});

describe("isDue", () => {
  it("is never due without a due date", () => {
    expect(isDue({ dueAt: null }, at(30))).toBe(false);
  });
  it("is due at and after the due date", () => {
    const dueAt = startOfDay(at(10));
    expect(isDue({ dueAt }, at(9, 23))).toBe(false);
    expect(isDue({ dueAt }, dueAt)).toBe(true);
    expect(isDue({ dueAt }, at(12))).toBe(true);
  });
});

describe("nextReviewState with a deadline", () => {
  const box4: ReviewState = { box: 4, dueAt: at(6, 0), lastReviewedAt: at(1), lastResult: "PASS" };

  it("pulls a review that would land after the deadline back onto it", () => {
    // Box 5 would be due 30 days on; the plan ends on the 20th.
    const next = nextReviewState(box4, "PASS", at(6), at(20, 0));
    expect(next.box).toBe(5);
    expect(ymd(next.dueAt)).toBe("2026-11-20");
  });

  it("leaves a review that lands before the deadline alone", () => {
    const next = nextReviewState(NEW_QUESTION_STATE, "PASS", at(6), at(20, 0));
    expect(ymd(next.dueAt)).toBe("2026-11-9");
  });

  it("ignores a deadline that is today or already past", () => {
    expect(ymd(nextReviewState(box4, "PASS", at(6), at(6, 0)).dueAt)).toBe("2026-12-6");
    expect(ymd(nextReviewState(box4, "PASS", at(6), at(2, 0)).dueAt)).toBe("2026-12-6");
  });
});
