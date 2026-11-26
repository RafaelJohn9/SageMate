import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  reviewSessionItem: { findUnique: vi.fn(), update: vi.fn() },
  attempt: { create: vi.fn() },
  question: { findUnique: vi.fn() },
}));
const gradeAttempt = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/grading", () => ({ gradeAttempt }));

import { POST } from "../review/items/[itemId]/answer/route";

const params = { params: Promise.resolve({ itemId: "i1" }) };
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params);

const question = { id: "q1", text: "T", questionSetId: "s1", stepId: "st1", marks: 4, markingScheme: "ms" };

beforeEach(() => {
  vi.resetAllMocks();
  db.attempt.create.mockImplementation(async ({ data }) => ({ id: "a1", ...data }));
});

describe("POST /review/items/:id/answer", () => {
  it("404s for an item that is not in a session", async () => {
    db.reviewSessionItem.findUnique.mockResolvedValue(null);
    expect((await post({ answerText: "a" })).status).toBe(404);
  });

  it("refuses a second answer to the same item", async () => {
    db.reviewSessionItem.findUnique.mockResolvedValue({ id: "i1", questionId: "q1", attemptId: "a0", question });
    expect((await post({ answerText: "a" })).status).toBe(409);
    expect(db.attempt.create).not.toHaveBeenCalled();
  });

  it("400s on a blank answer and stores nothing", async () => {
    db.reviewSessionItem.findUnique.mockResolvedValue({ id: "i1", questionId: "q1", attemptId: null, question });
    expect((await post({ answerText: "  " })).status).toBe(400);
    expect(db.attempt.create).not.toHaveBeenCalled();
  });

  it("grades the answer, ticks the item off and returns the new schedule", async () => {
    db.reviewSessionItem.findUnique.mockResolvedValue({ id: "i1", questionId: "q1", attemptId: null, question });
    gradeAttempt.mockResolvedValue({ id: "g1", score: 80 });
    db.question.findUnique.mockResolvedValue({ box: 2, dueAt: "2026-11-29T00:00:00.000Z" });

    const res = await post({ answerText: "my answer" });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(gradeAttempt).toHaveBeenCalledWith(question, expect.objectContaining({ id: "a1", answerText: "my answer" }));
    expect(db.reviewSessionItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { attemptId: "a1" } });
    expect(body.attempt.grading).toEqual({ id: "g1", score: 80 });
    expect(body.schedule).toEqual({ box: 2, dueAt: "2026-11-29T00:00:00.000Z" });
  });

  it("leaves the item open when grading fails, so it can be answered again", async () => {
    db.reviewSessionItem.findUnique.mockResolvedValue({ id: "i1", questionId: "q1", attemptId: null, question });
    gradeAttempt.mockRejectedValue(new Error("rate limited"));

    const res = await post({ answerText: "x" });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.gradingError).toContain("rate limited");
    expect(db.reviewSessionItem.update).not.toHaveBeenCalled();
  });
});
