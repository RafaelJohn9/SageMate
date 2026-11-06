import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { GroqProvider } from "../providers/groq";

const reply = (content: string | null) => ({ choices: [{ message: { content } }] });
const json = (value: unknown) => reply(JSON.stringify(value));

const q = (text: string, extra = {}) => ({
  text,
  questionType: "CONCEPTUAL",
  marks: 2,
  markingScheme: "2 marks",
  ...extra,
});

let provider: GroqProvider;
beforeEach(() => {
  create.mockReset();
  provider = new GroqProvider("key");
});

describe("completeJson retry behaviour", () => {
  it("returns parsed questions on first success", async () => {
    create.mockResolvedValueOnce(json({ questions: [q("What is X?")] }));
    const out = await provider.generateQuestions({ unitTitle: "U", purpose: "CAT1", notesText: "n", count: 3 });
    expect(out).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries on invalid JSON then succeeds, lowering temperature", async () => {
    create.mockResolvedValueOnce(reply("not json")).mockResolvedValueOnce(json({ questions: [q("Q?")] }));
    await provider.generateQuestions({ unitTitle: "U", purpose: "P", notesText: "n", count: 3 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].temperature).toBe(0.2);
  });

  it("retries on schema mismatch and throws after 3 attempts", async () => {
    create.mockResolvedValue(json({ questions: [{ text: "" }] }));
    await expect(
      provider.generateQuestions({ unitTitle: "U", purpose: "P", notesText: "n", count: 3 }),
    ).rejects.toThrow(/did not match expected schema/);
    expect(create).toHaveBeenCalledTimes(3);
  });
});

describe("extractQuestions", () => {
  it("un-double-escapes quotes", async () => {
    create.mockResolvedValueOnce(json({ questions: [q('Define \\"entropy\\".')] }));
    const [out] = await provider.extractQuestions({ unitTitle: "U", sourceText: "s" });
    expect(out.text).toBe('Define "entropy".');
  });
});

describe("generateRevisionQA", () => {
  const input = { unitTitle: "U", purpose: "Exam", sourceText: "Some notes. ".repeat(50) };
  const qa = (text: string) => q(text, { answer: "A" });

  it("dedupes questions ignoring case and punctuation", async () => {
    create.mockResolvedValueOnce(json({ questions: [qa("What is DNA?"), qa("what is dna")] }));
    const out = await provider.generateRevisionQA(input);
    expect(out).toHaveLength(1);
  });

  it("surfaces the error when every part fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockResolvedValue(reply("garbage"));
    await expect(provider.generateRevisionQA(input)).rejects.toThrow();
  });
});

describe("gradeAnswer", () => {
  it("validates score bounds", async () => {
    create.mockResolvedValue(json({ score: 150, feedback: "x" }));
    await expect(
      provider.gradeAnswer({ questionText: "q", sourceText: "s", answerText: "a" }),
    ).rejects.toThrow();
  });
});

describe("gradeAnswerBatch", () => {
  const item = (id: string) => ({ refId: id, questionText: "q", sourceText: "s", answerText: "a" });

  it("returns [] for no items without calling the API", async () => {
    expect(await provider.gradeAnswerBatch([])).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("falls back to single grading for items missing from the batch response", async () => {
    create
      .mockResolvedValueOnce(json({ results: [{ refId: "a", score: 80, feedback: "good" }] }))
      .mockResolvedValueOnce(json({ score: 40, feedback: "meh" }));
    const out = await provider.gradeAnswerBatch([item("a"), item("b")]);
    expect(out.map((r) => [r.refId, r.score])).toEqual([
      ["a", 80],
      ["b", 40],
    ]);
  });

  it("chunks large batches by 8", async () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`r${i}`));
    create.mockImplementation(async (args: { messages: { content: string }[] }) => {
      const ids = [...args.messages[1].content.matchAll(/refId: "(r\d+)"/g)].map((m) => m[1]);
      return json({ results: ids.map((refId) => ({ refId, score: 50, feedback: "ok" })) });
    });
    const out = await provider.gradeAnswerBatch(items);
    expect(out).toHaveLength(9);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("discussAnswer", () => {
  const input = {
    questionText: "q",
    sourceText: "s",
    answerText: "a",
    grading: { score: 50, feedback: "f" },
    history: [{ role: "user" as const, content: "why?" }],
  };
  it("retries on empty replies", async () => {
    create.mockResolvedValueOnce(reply("  ")).mockResolvedValueOnce(reply(" Because. "));
    expect(await provider.discussAnswer(input)).toBe("Because.");
  });
  it("throws after repeated failures", async () => {
    create.mockRejectedValue(new Error("boom"));
    await expect(provider.discussAnswer(input)).rejects.toThrow(/discussion request failed/);
  });
});
