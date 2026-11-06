import { describe, expect, it } from "vitest";
import {
  MAX_REVISION_QUESTIONS,
  MIN_REVISION_QUESTIONS,
  planRevisionChunks,
  revisionQuestionCount,
} from "../llm/revisionPlan";

describe("revisionQuestionCount", () => {
  it("clamps to min and max", () => {
    expect(revisionQuestionCount(0)).toBe(MIN_REVISION_QUESTIONS);
    expect(revisionQuestionCount(10_000_000)).toBe(MAX_REVISION_QUESTIONS);
  });
  it("scales with length in between", () => {
    expect(revisionQuestionCount(22_000)).toBe(40);
  });
});

describe("planRevisionChunks", () => {
  it("returns nothing for blank input", () => {
    expect(planRevisionChunks("   \n ")).toEqual([]);
  });
  it("allocates exactly the target total across chunks", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(300)).join("\n\n");
    const chunks = planRevisionChunks(text);
    const total = chunks.reduce((s, c) => s + c.count, 0);
    expect(chunks.length).toBeGreaterThan(1);
    expect(total).toBe(Math.max(revisionQuestionCount(text.length), chunks.length * 2));
    expect(chunks.every((c) => c.count >= 2)).toBe(true);
  });
  it("keeps chunks within the size limit even for one huge paragraph", () => {
    const chunks = planRevisionChunks("x".repeat(20_000));
    expect(chunks.every((c) => c.text.length <= 7_000)).toBe(true);
  });
  it("samples very large input down to a bounded number of chunks", () => {
    const chunks = planRevisionChunks("y".repeat(500_000));
    expect(chunks.length).toBeLessThanOrEqual(6);
    expect(chunks.reduce((s, c) => s + c.count, 0)).toBeLessThanOrEqual(MAX_REVISION_QUESTIONS);
  });
});
