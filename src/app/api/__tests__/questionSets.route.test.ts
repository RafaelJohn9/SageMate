import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  unit: { findUnique: vi.fn() },
  content: { findMany: vi.fn() },
  question: { findMany: vi.fn() },
  questionSet: { create: vi.fn(), findMany: vi.fn() },
}));
const llm = vi.hoisted(() => ({ name: "fake", model: "fake-1" }));
const runGeneration = vi.hoisted(() => vi.fn());
// next/server's after() needs a live request; capture its callbacks so tests decide when they run.
const scheduled = vi.hoisted(() => [] as (() => unknown)[]);

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/llm/factory", () => ({ getLLMProvider: () => llm }));
vi.mock("@/lib/generation", () => ({ runGeneration }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => {
    scheduled.push(callback);
  },
}));

import { GET, POST } from "../units/[unitId]/question-sets/route";

const params = { params: Promise.resolve({ unitId: "u1" }) };
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), params);

const notes = { id: "c1", unitId: "u1", title: "Lecture 1", contentKind: "NOTES", rawText: "notes body" };
const paper = { id: "c2", unitId: "u1", title: "CAT 2024", contentKind: "PAST_PAPER", rawText: "paper body" };
const runScheduled = () => Promise.all(scheduled.splice(0).map((callback) => callback()));
const valid = { name: "Set", purposeFilter: ["CAT1"], contentIds: ["c1"] };

beforeEach(() => {
  vi.resetAllMocks();
  scheduled.length = 0;
  db.unit.findUnique.mockResolvedValue({ id: "u1", name: "Biology" });
  db.content.findMany.mockResolvedValue([notes]);
  db.question.findMany.mockResolvedValue([]);
  db.questionSet.create.mockResolvedValue({ id: "s1", status: "PENDING" });
  runGeneration.mockResolvedValue(undefined);
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

describe("POST returns before generation finishes", () => {
  it("responds 202 with the pending set and does not generate inline", async () => {
    const res = await post(valid);

    expect(res.status).toBe(202);
    expect((await res.json()).questionSet).toMatchObject({ id: "s1", status: "PENDING" });
    expect(db.questionSet.create.mock.calls[0][0].data).toMatchObject({
      kind: "PRACTICE",
      status: "PENDING",
      provider: "fake",
      model: "fake-1",
      purposeFilter: "CAT1",
    });
    expect(runGeneration).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
  });

  it("hands the job to runGeneration once the response is done", async () => {
    await post(valid);
    await runScheduled();

    expect(runGeneration).toHaveBeenCalledTimes(1);
    expect(runGeneration).toHaveBeenCalledWith(llm, expect.objectContaining({ questionSetId: "s1", mode: "generate" }));
  });
});

describe("POST job contents", () => {
  it("separates notes from past papers and includes prior questions in generate mode", async () => {
    db.content.findMany.mockResolvedValue([notes, paper]);
    db.question.findMany.mockResolvedValue([{ text: "Old question?" }]);

    await post({ ...valid, contentIds: ["c1", "c2"], count: 8 });
    await runScheduled();

    expect(runGeneration.mock.calls[0][1]).toEqual({
      questionSetId: "s1",
      mode: "generate",
      unitTitle: "Biology",
      purpose: "CAT1",
      count: 8,
      notesText: "## Lecture 1\nnotes body",
      pastPaperText: "## CAT 2024\npaper body",
      allSourceText: "## Lecture 1\nnotes body\n\n## CAT 2024\npaper body",
      priorQuestions: ["Old question?"],
    });
  });

  it("omits past papers when only notes are selected", async () => {
    await post(valid);
    await runScheduled();
    expect(runGeneration.mock.calls[0][1].pastPaperText).toBeUndefined();
  });

  it("extract skips the prior-question lookup and stays a practice set", async () => {
    await post({ ...valid, mode: "extract" });
    await runScheduled();

    expect(db.question.findMany).not.toHaveBeenCalled();
    expect(db.questionSet.create.mock.calls[0][0].data.kind).toBe("PRACTICE");
    expect(runGeneration.mock.calls[0][1].mode).toBe("extract");
  });

  it("revision creates a REVISION set", async () => {
    await post({ ...valid, mode: "revision" });
    await runScheduled();

    expect(db.questionSet.create.mock.calls[0][0].data.kind).toBe("REVISION");
    expect(runGeneration.mock.calls[0][1].mode).toBe("revision");
  });
});

describe("POST with a chapter range", () => {
  const book = {
    id: "c3",
    unitId: "u1",
    title: "Full notes",
    contentKind: "NOTES",
    rawText: "Chapter 1\nintro\nChapter 2\ncells\nChapter 3\ngenes",
    outline: null, // older content: the outline is detected from the text
  };

  beforeEach(() => db.content.findMany.mockResolvedValue([book]));

  it("sends only the chosen chapters to the LLM and stores the range on the set", async () => {
    const res = await post({ ...valid, contentIds: ["c3"], ranges: { c3: { from: 0, to: 1 } } });
    await runScheduled();

    expect(res.status).toBe(202);
    const text = "## Full notes (Chapter 1 → Chapter 2)\nChapter 1\nintro\nChapter 2\ncells";
    expect(runGeneration.mock.calls[0][1]).toMatchObject({ notesText: text, allSourceText: text });
    expect(db.questionSet.create.mock.calls[0][0].data.sourceContent).toEqual({
      create: [{ contentId: "c3", rangeStart: 0, rangeEnd: 32, rangeLabel: "Chapter 1 → Chapter 2" }],
    });
  });

  it("treats a range covering every chapter as the whole document", async () => {
    await post({ ...valid, contentIds: ["c3"], ranges: { c3: { from: 0, to: 2 } } });
    await runScheduled();

    expect(runGeneration.mock.calls[0][1].notesText).toBe(`## Full notes\n${book.rawText}`);
    expect(db.questionSet.create.mock.calls[0][0].data.sourceContent).toEqual({ create: [{ contentId: "c3" }] });
  });

  it("400s on a range past the last chapter and creates nothing", async () => {
    const res = await post({ ...valid, contentIds: ["c3"], ranges: { c3: { from: 1, to: 5 } } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('"Full notes" has only 3 sections');
    expect(db.questionSet.create).not.toHaveBeenCalled();
  });

  it("400s on a backwards range", async () => {
    const res = await post({ ...valid, contentIds: ["c3"], ranges: { c3: { from: 2, to: 1 } } });
    expect(res.status).toBe(400);
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
