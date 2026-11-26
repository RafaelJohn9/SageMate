import { describe, expect, it } from "vitest";
import { composeSession, countStreak, interleave, type UnitCandidates } from "../morning";
import { addDays } from "../studyPlan";

const unit = (unitId: string, c: Partial<Omit<UnitCandidates, "unitId">> = {}): UnitCandidates => ({
  unitId,
  due: [],
  fresh: [],
  early: [],
  ...c,
});
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const unitsOf = (picks: { unitId: string }[]) => new Set(picks.map((p) => p.unitId));

describe("composeSession", () => {
  it("draws from at least minUnits units even when one unit could fill the session alone", () => {
    const picks = composeSession(
      [unit("a", { due: ids("a", 10) }), unit("b", { early: ids("b", 2) }), unit("c", { fresh: ids("c", 1) })],
      { count: 5, minUnits: 3 },
    );
    expect(picks).toHaveLength(5);
    expect(unitsOf(picks)).toEqual(new Set(["a", "b", "c"]));
  });

  it("uses as many units as there are when fewer than minUnits have anything to ask", () => {
    const picks = composeSession([unit("a", { due: ids("a", 4) }), unit("b", { due: ids("b", 4) }), unit("c")], {
      count: 5,
      minUnits: 3,
    });
    expect(picks).toHaveLength(5);
    expect(unitsOf(picks)).toEqual(new Set(["a", "b"]));
  });

  it("keeps a share for new material when reviews could take every slot", () => {
    const picks = composeSession(
      [unit("a", { due: ids("a", 10), fresh: ids("an", 5) }), unit("b", { due: ids("b", 10), fresh: ids("bn", 5) })],
      { count: 5, minUnits: 2 },
    );
    expect(picks.filter((p) => p.reason === "new")).toHaveLength(2);
    expect(picks.filter((p) => p.reason === "due")).toHaveLength(3);
  });

  it("gives unused new slots to reviews, and unused review slots to new material", () => {
    const onlyDue = composeSession([unit("a", { due: ids("a", 10) })], { count: 5, minUnits: 1 });
    expect(onlyDue.every((p) => p.reason === "due")).toBe(true);

    const onlyNew = composeSession([unit("a", { fresh: ids("a", 10) })], { count: 5, minUnits: 1 });
    expect(onlyNew).toHaveLength(5);
    expect(onlyNew.every((p) => p.reason === "new")).toBe(true);
  });

  it("fills up with questions that are not due yet only after everything else", () => {
    const picks = composeSession([unit("a", { due: ["d1"], fresh: ["n1"], early: ids("e", 10) })], {
      count: 5,
      minUnits: 1,
    });
    expect(picks.map((p) => p.reason).sort()).toEqual(["due", "early", "early", "early", "new"]);
  });

  it("takes each unit's candidates in the order given and never repeats a question", () => {
    const picks = composeSession([unit("a", { due: ["first", "second", "third"] })], { count: 2, minUnits: 1 });
    expect(picks.map((p) => p.questionId)).toEqual(["first", "second"]);

    const all = composeSession([unit("a", { due: ids("a", 3) }), unit("b", { due: ids("b", 3) })], {
      count: 6,
      minUnits: 2,
    });
    expect(new Set(all.map((p) => p.questionId)).size).toBe(6);
  });

  it("returns fewer than asked when there is not enough to ask", () => {
    expect(composeSession([unit("a", { due: ["x"] })], { count: 5, minUnits: 3 })).toHaveLength(1);
    expect(composeSession([], { count: 5, minUnits: 3 })).toEqual([]);
  });

  it("shares the session out rather than letting one unit dominate", () => {
    const picks = composeSession(
      [unit("a", { due: ids("a", 10) }), unit("b", { due: ids("b", 10) }), unit("c", { due: ids("c", 10) })],
      { count: 6, minUnits: 3 },
    );
    for (const u of ["a", "b", "c"]) expect(picks.filter((p) => p.unitId === u)).toHaveLength(2);
  });
});

describe("interleave", () => {
  it("avoids two questions in a row from the same unit where possible", () => {
    const pick = (unitId: string, n: number) => ({ questionId: `${unitId}${n}`, unitId, reason: "due" as const });
    const ordered = interleave([pick("a", 1), pick("a", 2), pick("a", 3), pick("b", 1), pick("c", 1)]);
    expect(ordered).toHaveLength(5);
    for (let i = 1; i < ordered.length; i++) expect(ordered[i].unitId).not.toBe(ordered[i - 1].unitId);
  });
});

describe("countStreak", () => {
  const previous = (day: string) => addDays(day, -1);

  it("counts consecutive mornings ending today", () => {
    expect(countStreak(["2026-11-26", "2026-11-25", "2026-11-24", "2026-11-22"], "2026-11-26", previous)).toBe(3);
  });

  it("keeps yesterday's streak alive until today is done", () => {
    expect(countStreak(["2026-11-25", "2026-11-24"], "2026-11-26", previous)).toBe(2);
  });

  it("is zero after a missed day", () => {
    expect(countStreak(["2026-11-23"], "2026-11-26", previous)).toBe(0);
    expect(countStreak([], "2026-11-26", previous)).toBe(0);
  });
});
