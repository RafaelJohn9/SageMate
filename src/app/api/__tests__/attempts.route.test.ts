import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  question: { findUnique: vi.fn() },
  attempt: { create: vi.fn(), findMany: vi.fn() },
  grading: { create: vi.fn() },
}));
const llm = vi.hoisted(() => ({ name: "fake", model: "fake-1", gradeAnswer: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/llm/factory", () => ({ getLLMProvider: () => llm }));
vi.mock("@/lib/questionSets", () => ({ getQuestionSetSourceText: async () => "source" }));

import { GET, POST } from "../questions/[questionId]/attempts/route";

const params = { params: Promise.resolve({ questionId: "q1" }) };
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /questions/:id/attempts", () => {
  it("404s for an unknown question", async () => {
    db.question.findUnique.mockResolvedValue(null);
    expect((await post({ answerText: "a" })).status).toBe(404);
  });

  it("400s on a blank answer and stores nothing", async () => {
    db.question.findUnique.mockResolvedValue({ id: "q1", text: "T", questionSetId: "s1" });
    expect((await post({ answerText: "  " })).status).toBe(400);
    expect(db.attempt.create).not.toHaveBeenCalled();
  });

  it("stores the attempt and grading on success", async () => {
    db.question.findUnique.mockResolvedValue({ id: "q1", text: "T", questionSetId: "s1", marks: 4, markingScheme: "ms" });
    db.attempt.create.mockResolvedValue({ id: "a1" });
    llm.gradeAnswer.mockResolvedValue({ score: 75, marksAwarded: 3, feedback: "good" });
    db.grading.create.mockImplementation(async ({ data }) => ({ id: "g1", ...data }));

    const res = await post({ answerText: "my answer" });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(llm.gradeAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ questionText: "T", answerText: "my answer", marks: 4, markingScheme: "ms" }),
    );
    expect(body.attempt.grading).toMatchObject({ score: 75, provider: "fake", model: "fake-1" });
  });

  it("keeps the attempt and reports gradingError when the LLM fails", async () => {
    db.question.findUnique.mockResolvedValue({ id: "q1", text: "T", questionSetId: "s1" });
    db.attempt.create.mockResolvedValue({ id: "a1" });
    llm.gradeAnswer.mockRejectedValue(new Error("rate limited"));

    const res = await post({ answerText: "x" });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.attempt.id).toBe("a1");
    expect(body.gradingError).toContain("rate limited");
    expect(db.grading.create).not.toHaveBeenCalled();
  });
});

describe("GET /questions/:id/attempts", () => {
  it("returns attempts newest first", async () => {
    db.attempt.findMany.mockResolvedValue([{ id: "a1" }]);
    const res = await GET(new Request("http://x"), params);
    expect(await res.json()).toEqual({ attempts: [{ id: "a1" }] });
    expect(db.attempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { questionId: "q1" }, orderBy: { submittedAt: "desc" } }),
    );
  });
});
