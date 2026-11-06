import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  question: { createMany: vi.fn() },
  questionSet: { update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

import { runGeneration, type GenerationJob } from "../generation";
import type { LLMProvider } from "../llm/types";

const llm = {
  name: "fake",
  model: "fake-1",
  generateQuestions: vi.fn(),
  extractQuestions: vi.fn(),
  generateRevisionQA: vi.fn(),
} as unknown as LLMProvider & {
  generateQuestions: ReturnType<typeof vi.fn>;
  extractQuestions: ReturnType<typeof vi.fn>;
  generateRevisionQA: ReturnType<typeof vi.fn>;
};

const job = (overrides: Partial<GenerationJob> = {}): GenerationJob => ({
  questionSetId: "s1",
  mode: "generate",
  unitTitle: "Biology",
  purpose: "CAT1",
  count: 8,
  notesText: "## Notes\nbody",
  pastPaperText: "## Paper\nbody",
  allSourceText: "## Notes\nbody\n\n## Paper\nbody",
  priorQuestions: ["Old?"],
  ...overrides,
});

const question = (extra = {}) => ({
  text: "What is X?",
  questionType: "CONCEPTUAL",
  marks: 3,
  markingScheme: "3 marks",
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.questionSet.update.mockResolvedValue({});
  db.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  llm.generateQuestions.mockResolvedValue([question()]);
});

describe("runGeneration success", () => {
  it("generate mode passes the job fields to the LLM", async () => {
    await runGeneration(llm, job());
    expect(llm.generateQuestions).toHaveBeenCalledWith({
      unitTitle: "Biology",
      purpose: "CAT1",
      notesText: "## Notes\nbody",
      pastPaperText: "## Paper\nbody",
      priorQuestions: ["Old?"],
      count: 8,
    });
  });

  it("falls back to a placeholder when there are no notes", async () => {
    await runGeneration(llm, job({ notesText: "" }));
    expect(llm.generateQuestions.mock.calls[0][0].notesText).toMatch(/no notes provided/);
  });

  it("saves questions in order and marks the set completed, clearing any old error", async () => {
    llm.generateQuestions.mockResolvedValue([question({ text: "A?" }), question({ text: "B?" })]);
    await runGeneration(llm, job());

    const rows = db.question.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { text: string; orderIndex: number }) => [r.text, r.orderIndex])).toEqual([
      ["A?", 0],
      ["B?", 1],
    ]);
    expect(db.questionSet.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "COMPLETED", error: null },
    });
  });

  it("extract mode uses all source text", async () => {
    llm.extractQuestions.mockResolvedValue([question()]);
    await runGeneration(llm, job({ mode: "extract" }));
    expect(llm.extractQuestions).toHaveBeenCalledWith({
      unitTitle: "Biology",
      sourceText: "## Notes\nbody\n\n## Paper\nbody",
    });
  });

  it("revision mode stores model answers", async () => {
    llm.generateRevisionQA.mockResolvedValue([question({ answer: "Model answer" })]);
    await runGeneration(llm, job({ mode: "revision" }));
    expect(db.question.createMany.mock.calls[0][0].data[0].answer).toBe("Model answer");
  });
});

describe("runGeneration failure", () => {
  const failedWith = (message: string) => ({
    where: { id: "s1" },
    data: { status: "FAILED", error: message },
  });

  it("records the LLM error on the set and saves no questions", async () => {
    llm.generateQuestions.mockRejectedValue(new Error("rate limited"));
    await runGeneration(llm, job());

    expect(db.questionSet.update).toHaveBeenCalledWith(failedWith("rate limited"));
    expect(db.question.createMany).not.toHaveBeenCalled();
  });

  it("treats an empty result as a failure with a mode-specific message", async () => {
    llm.extractQuestions.mockResolvedValue([]);
    await runGeneration(llm, job({ mode: "extract" }));
    expect(db.questionSet.update).toHaveBeenCalledWith(failedWith("No questions were found in the selected content"));

    db.questionSet.update.mockClear();
    llm.generateQuestions.mockResolvedValue([]);
    await runGeneration(llm, job());
    expect(db.questionSet.update).toHaveBeenCalledWith(failedWith("LLM returned no questions"));
  });

  it("never throws, even if recording the failure also fails", async () => {
    llm.generateQuestions.mockRejectedValue(new Error("boom"));
    db.questionSet.update.mockRejectedValue(new Error("db down"));
    await expect(runGeneration(llm, job())).resolves.toBeUndefined();
  });
});
