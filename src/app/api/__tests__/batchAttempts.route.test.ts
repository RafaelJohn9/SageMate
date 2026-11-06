import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  questionSet: { findUnique: vi.fn() },
  attempt: { create: vi.fn() },
  grading: { create: vi.fn() },
}));
const llm = vi.hoisted(() => ({ name: "fake", model: "fake-1", gradeAnswerBatch: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/llm/factory", () => ({ getLLMProvider: () => llm }));
vi.mock("@/lib/questionSets", () => ({ getQuestionSetSourceText: async () => "source" }));

import { POST } from "../question-sets/[setId]/attempts/batch/route";

const params = { params: Promise.resolve({ setId: "s1" }) };
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params);

const questions = [
  { id: "q1", text: "First?", marks: 4, markingScheme: "2x2" },
  { id: "q2", text: "Second?", marks: null, markingScheme: null },
];

beforeEach(() => {
  vi.resetAllMocks();
  db.questionSet.findUnique.mockResolvedValue({ id: "s1", questions });
  db.attempt.create.mockImplementation(async ({ data }) => ({ id: `a-${data.questionId}`, ...data }));
  db.grading.create.mockImplementation(async ({ data }) => ({ id: `g-${data.attemptId}`, ...data }));
});

describe("POST /question-sets/:id/attempts/batch validation", () => {
  it("404s for an unknown set", async () => {
    db.questionSet.findUnique.mockResolvedValue(null);
    expect((await post({ answers: [{ questionId: "q1", answerText: "a" }] })).status).toBe(404);
  });

  it("400s when there are no answers", async () => {
    expect((await post({ answers: [] })).status).toBe(400);
  });

  it("400s when no answer belongs to this set", async () => {
    const res = await post({ answers: [{ questionId: "other", answerText: "a" }] });
    expect(res.status).toBe(400);
    expect(db.attempt.create).not.toHaveBeenCalled();
  });

  it("ignores answers for questions outside the set", async () => {
    llm.gradeAnswerBatch.mockResolvedValue([]);
    await post({
      answers: [
        { questionId: "q1", answerText: "mine" },
        { questionId: "other", answerText: "stray" },
      ],
    });
    expect(db.attempt.create).toHaveBeenCalledTimes(1);
    expect(db.attempt.create.mock.calls[0][0].data).toMatchObject({ questionId: "q1", mode: "BATCH" });
  });
});

describe("POST grading", () => {
  const answers = [
    { questionId: "q1", answerText: "answer one" },
    { questionId: "q2", answerText: "answer two" },
  ];

  it("grades every answer with its question's marks and scheme, and saves gradings", async () => {
    llm.gradeAnswerBatch.mockResolvedValue([
      { refId: "a-q1", score: 75, marksAwarded: 3, feedback: "good" },
      { refId: "a-q2", score: 40, feedback: "meh" },
    ]);

    const res = await post({ answers });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(llm.gradeAnswerBatch).toHaveBeenCalledWith([
      expect.objectContaining({ refId: "a-q1", questionText: "First?", marks: 4, markingScheme: "2x2", sourceText: "source" }),
      expect.objectContaining({ refId: "a-q2", questionText: "Second?", marks: undefined, markingScheme: undefined }),
    ]);
    expect(body.attempts.map((a: { grading: { score: number } }) => a.grading.score)).toEqual([75, 40]);
    expect(body.attempts[0].grading).toMatchObject({ marksAwarded: 3, provider: "fake", model: "fake-1" });
    expect(body.attempts[1].grading.marksAwarded).toBeNull();
  });

  it("returns a null grading for an attempt the LLM skipped", async () => {
    llm.gradeAnswerBatch.mockResolvedValue([{ refId: "a-q1", score: 90, feedback: "great" }]);

    const body = await (await post({ answers })).json();

    expect(body.attempts[0].grading).not.toBeNull();
    expect(body.attempts[1].grading).toBeNull();
    expect(db.grading.create).toHaveBeenCalledTimes(1);
  });

  it("keeps the attempts and reports gradingError when grading fails", async () => {
    llm.gradeAnswerBatch.mockRejectedValue(new Error("boom"));

    const res = await post({ answers });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.gradingError).toContain("boom");
    expect(body.attempts).toHaveLength(2);
    expect(body.attempts.every((a: { grading: unknown }) => a.grading === null)).toBe(true);
    expect(db.grading.create).not.toHaveBeenCalled();
  });
});
