import { describe, expect, it } from "vitest";
import { summarizeUnit } from "../unitStats";

const q = (score?: number | null) => ({
  attempts: score === undefined ? [] : [{ grading: score === null ? null : { score } }],
});

describe("summarizeUnit", () => {
  it("handles a unit with no sets", () => {
    expect(summarizeUnit([])).toEqual({ total: 0, answered: 0, graded: 0, averageScore: null });
  });
  it("counts answered and graded questions across sets", () => {
    const result = summarizeUnit([{ questions: [q(80), q(), q(null)] }, { questions: [q(40)] }]);
    expect(result).toEqual({ total: 4, answered: 3, graded: 2, averageScore: 60 });
  });
  it("rounds the average", () => {
    expect(summarizeUnit([{ questions: [q(50), q(51)] }]).averageScore).toBe(51);
  });
  it("returns null average when nothing is graded", () => {
    expect(summarizeUnit([{ questions: [q(null)] }]).averageScore).toBeNull();
  });
});
