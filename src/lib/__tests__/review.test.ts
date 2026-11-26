import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ question: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { recordReview } from "../review";
import { startOfDay } from "../spacedRepetition";

const reviewedAt = new Date(2026, 10, 6, 15);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordReview", () => {
  it("reads the question's schedule and writes the next state", async () => {
    db.question.findUnique.mockResolvedValue({ box: 1, dueAt: null, lastReviewedAt: null, lastResult: null });
    db.question.update.mockResolvedValue({});

    await recordReview("q1", "PASS", reviewedAt);

    expect(db.question.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: {
        box: 2,
        dueAt: startOfDay(new Date(2026, 10, 9)),
        lastReviewedAt: reviewedAt,
        lastResult: "PASS",
      },
    });
  });

  it("does nothing for a question that no longer exists", async () => {
    db.question.findUnique.mockResolvedValue(null);
    await recordReview("gone", "FAIL", reviewedAt);
    expect(db.question.update).not.toHaveBeenCalled();
  });

  it("never throws, so a scheduling problem cannot break grading", async () => {
    db.question.findUnique.mockRejectedValue(new Error("db down"));
    await expect(recordReview("q1", "PASS", reviewedAt)).resolves.toBeUndefined();

    db.question.findUnique.mockResolvedValue({ box: 1, dueAt: null, lastReviewedAt: null, lastResult: null });
    db.question.update.mockRejectedValue(new Error("locked"));
    await expect(recordReview("q1", "PASS", reviewedAt)).resolves.toBeUndefined();
  });
});
