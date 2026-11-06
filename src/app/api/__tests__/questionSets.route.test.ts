import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  unit: { findUnique: vi.fn() },
  content: { findMany: vi.fn() },
  question: { findMany: vi.fn(), createMany: vi.fn() },
  questionSet: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const llm = vi.hoisted(() => ({
  name: "fake",
  model: "fake-1",
  generateQuestions: vi.fn(),
  extractQuestions: vi.fn(),
  generateRevisionQA: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/llm/factory", () => ({ getLLMProvider: () => llm }));

import { GET, POST } from "../units/[unitId]/question-sets/route";

const params = { params: Promise.resolve({ unitId: "u1" }) };
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params);

const notes = { id: "c1", unitId: "u1", title: "Lecture 1", contentKind: "NOTES", rawText: "notes body" };
const paper = { id: "c2", unitId: "u1", title: "CAT 2024", contentKind: "PAST_PAPER", rawText: "paper body" };
const generated = (extra = {}) => ({
  text: "What is X?",
  questionType: "CONCEPTUAL",
  marks: 3,
  markingScheme: "3 marks",
  ...extra,
});
const valid = { name: "Set", purposeFilter: ["CAT1"], contentIds: ["c1"] };

beforeEach(() => {
  vi.resetAllMocks();
  db.unit.findUnique.mockResolvedValue({ id: "u1", name: "Biology" });
  db.content.findMany.mockResolvedValue([notes]);
  db.question.findMany.mockResolvedValue([]);
  db.questionSet.create.mockResolvedValue({ id: "s1" });
  db.questionSet.update.mockResolvedValue({});
  db.questionSet.findUnique.mockResolvedValue({ id: "s1", questions: [] });
  db.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  llm.generateQuestions.mockResolvedValue([generated()]);
});

describe("POST /units/:id/question-sets validation", () => {
  it("404s for an unknown unit", async () => {
    db.unit.findUnique.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
  });

  it("400s on an invalid body and creates nothing", async () => {
    const res = await post({ ...valid, count: 2 });
    expect(res.status).toBe(400);
    expect(db.questionSet.create).not.toHaveBeenCalled();
  });

  it("400s when no content matches this unit", async () => {
    db.content.findMany.mockResolvedValue([]);
    const res = await post(valid);
    expect(res.status).toBe(400);
    expect(db.content.findMany).toHaveBeenCalledWith({ where: { id: { in: ["c1"] }, unitId: "u1" } });
  });
});

describe("POST generate mode", () => {
  it("separates notes from past papers and passes prior questions", async () => {
    db.content.findMany.mockResolvedValue([notes, paper]);
    db.question.findMany.mockResolvedValue([{ text: "Old question?" }]);

    const res = await post({ ...valid, contentIds: ["c1", "c2"], count: 8 });

    expect(res.status).toBe(201);
    expect(llm.generateQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        unitTitle: "Biology",
        purpose: "CAT1",
        count: 8,
        notesText: "## Lecture 1\nnotes body",
        pastPaperText: "## CAT 2024\npaper body",
        priorQuestions: ["Old question?"],
      }),
    );
    expect(db.questionSet.create.mock.calls[0][0].data).toMatchObject({
      kind: "PRACTICE",
      status: "PENDING",
      provider: "fake",
      purposeFilter: "CAT1",
    });
  });

  it("omits past papers when only notes are selected", async () => {
    await post(valid);
    expect(llm.generateQuestions.mock.calls[0][0].pastPaperText).toBeUndefined();
  });

  it("saves questions in order and marks the set completed", async () => {
    llm.generateQuestions.mockResolvedValue([generated({ text: "A?" }), generated({ text: "B?" })]);
    await post(valid);

    const rows = db.question.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { text: string; orderIndex: number }) => [r.text, r.orderIndex])).toEqual([
      ["A?", 0],
      ["B?", 1],
    ]);
    expect(db.questionSet.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "COMPLETED" } });
  });
});

describe("POST extract and revision modes", () => {
  it("extract uses all source text and skips prior-question lookup", async () => {
    db.content.findMany.mockResolvedValue([notes, paper]);
    llm.extractQuestions.mockResolvedValue([generated()]);

    const res = await post({ ...valid, contentIds: ["c1", "c2"], mode: "extract" });

    expect(res.status).toBe(201);
    expect(llm.extractQuestions).toHaveBeenCalledWith({
      unitTitle: "Biology",
      sourceText: "## Lecture 1\nnotes body\n\n## CAT 2024\npaper body",
    });
    expect(db.question.findMany).not.toHaveBeenCalled();
    expect(db.questionSet.create.mock.calls[0][0].data.kind).toBe("PRACTICE");
  });

  it("revision creates a REVISION set and stores model answers", async () => {
    llm.generateRevisionQA.mockResolvedValue([generated({ answer: "Model answer" })]);

    const res = await post({ ...valid, mode: "revision" });

    expect(res.status).toBe(201);
    expect(db.questionSet.create.mock.calls[0][0].data.kind).toBe("REVISION");
    expect(db.question.createMany.mock.calls[0][0].data[0].answer).toBe("Model answer");
  });
});

describe("POST failure handling", () => {
  it("marks the set FAILED and returns 502 when the LLM throws", async () => {
    llm.generateQuestions.mockRejectedValue(new Error("rate limited"));

    const res = await post(valid);

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("rate limited");
    expect(db.questionSet.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "FAILED" } });
    expect(db.question.createMany).not.toHaveBeenCalled();
  });

  it("treats an empty result as a failure with a mode-specific message", async () => {
    llm.extractQuestions.mockResolvedValue([]);

    const res = await post({ ...valid, mode: "extract" });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("No questions were found");
    expect(db.questionSet.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "FAILED" } });
  });
});

describe("GET /units/:id/question-sets", () => {
  it("lists a unit's sets newest first", async () => {
    db.questionSet.findMany.mockResolvedValue([{ id: "s1" }]);
    const res = await GET(new Request("http://x"), params);
    expect(await res.json()).toEqual({ questionSets: [{ id: "s1" }] });
    expect(db.questionSet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unitId: "u1" }, orderBy: { createdAt: "desc" } }),
    );
  });
});
