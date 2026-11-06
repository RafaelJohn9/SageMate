import { describe, expect, it } from "vitest";
import { createPasteContentSchema } from "../validation/content";
import { createQuestionSetSchema } from "../validation/questionSets";
import { createUnitSchema, updateUnitSchema } from "../validation/units";
import {
  discussionMessageSchema,
  submitAttemptSchema,
  submitBatchAttemptsSchema,
} from "../validation/attempts";

describe("unit schemas", () => {
  it("trims names and rejects blanks", () => {
    expect(createUnitSchema.parse({ name: "  Maths  " }).name).toBe("Maths");
    expect(createUnitSchema.safeParse({ name: "   " }).success).toBe(false);
  });
  it("allows partial updates", () => {
    expect(updateUnitSchema.safeParse({}).success).toBe(true);
    expect(updateUnitSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("content schema", () => {
  it("applies defaults", () => {
    const r = createPasteContentSchema.parse({ title: "T", text: "body" });
    expect(r.contentKind).toBe("NOTES");
    expect(r.purpose).toBe("GENERAL");
  });
  it("rejects unknown kinds and empty text", () => {
    expect(createPasteContentSchema.safeParse({ title: "T", text: "x", contentKind: "BOOK" }).success).toBe(false);
    expect(createPasteContentSchema.safeParse({ title: "T", text: " " }).success).toBe(false);
  });
});

describe("question set schema", () => {
  const base = { name: "Set", purposeFilter: ["CAT1"], contentIds: ["c1"] };
  it("defaults count and mode", () => {
    const r = createQuestionSetSchema.parse(base);
    expect(r.count).toBe(10);
    expect(r.mode).toBe("generate");
  });
  it("enforces count bounds", () => {
    expect(createQuestionSetSchema.safeParse({ ...base, count: 2 }).success).toBe(false);
    expect(createQuestionSetSchema.safeParse({ ...base, count: 16 }).success).toBe(false);
    expect(createQuestionSetSchema.safeParse({ ...base, count: 15 }).success).toBe(true);
  });
  it("requires purposes and content", () => {
    expect(createQuestionSetSchema.safeParse({ ...base, purposeFilter: [] }).success).toBe(false);
    expect(createQuestionSetSchema.safeParse({ ...base, contentIds: [] }).success).toBe(false);
  });
});

describe("attempt schemas", () => {
  it("rejects blank answers", () => {
    expect(submitAttemptSchema.safeParse({ answerText: "  " }).success).toBe(false);
    expect(submitAttemptSchema.parse({ answerText: " hi " }).answerText).toBe("hi");
  });
  it("requires at least one batch answer", () => {
    expect(submitBatchAttemptsSchema.safeParse({ answers: [] }).success).toBe(false);
    expect(
      submitBatchAttemptsSchema.safeParse({ answers: [{ questionId: "q", answerText: "a" }] }).success,
    ).toBe(true);
  });
  it("caps discussion messages at 4000 chars", () => {
    expect(discussionMessageSchema.safeParse({ content: "a".repeat(4000) }).success).toBe(true);
    expect(discussionMessageSchema.safeParse({ content: "a".repeat(4001) }).success).toBe(false);
  });
});
