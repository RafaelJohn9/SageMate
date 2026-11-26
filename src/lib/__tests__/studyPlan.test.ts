import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  dayToDate,
  isValidDay,
  planSteps,
  readingForToday,
  STEP_MAX_CHARS,
  STEP_MIN_CHARS,
  toDay,
  trackPhase,
} from "../studyPlan";

describe("days", () => {
  it("round-trips a local calendar day", () => {
    expect(toDay(new Date(2026, 10, 6, 23, 59))).toBe("2026-11-06");
    expect(toDay(dayToDate("2026-01-09"))).toBe("2026-01-09");
  });

  it("rejects malformed and impossible dates", () => {
    expect(isValidDay("2026-11-26")).toBe(true);
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("26/11/2026")).toBe(false);
  });

  it("does calendar arithmetic across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-26", "2026-12-03")).toBe(7);
    expect(daysBetween("2026-12-03", "2026-11-26")).toBe(-7);
  });

  it("places today relative to a track's dates, both ends included", () => {
    const track = { startDate: "2026-11-10", endDate: "2026-11-20" };
    expect(trackPhase(track, "2026-11-09")).toBe("upcoming");
    expect(trackPhase(track, "2026-11-10")).toBe("active");
    expect(trackPhase(track, "2026-11-20")).toBe("active");
    expect(trackPhase(track, "2026-11-21")).toBe("finished");
  });
});

const para = (chars: number) => "x".repeat(chars - 2) + "\n\n";

describe("planSteps", () => {
  // Three sections of a comfortable size, after a short preface.
  const text = para(200) + para(2000) + para(3000) + para(2500);
  const outline = [
    { title: "1 Cells", level: 1, start: 200 },
    { title: "2 Tissues", level: 1, start: 2200 },
    { title: "3 Organs", level: 1, start: 5200 },
  ];

  it("makes one step per section and covers every character once", () => {
    const steps = planSteps(text, outline, "Biology notes");
    expect(steps.map((s) => s.title)).toEqual(["1 Cells", "2 Tissues", "3 Organs"]);
    // The preface is too short to stand alone, so it travels with the first section.
    expect(steps[0].start).toBe(0);
    expect(steps.at(-1)!.end).toBe(text.length);
    for (let i = 1; i < steps.length; i++) expect(steps[i].start).toBe(steps[i - 1].end);
  });

  it("stays inside the chosen range", () => {
    const steps = planSteps(text, outline, "Biology notes", { start: 2200, end: 5200 });
    expect(steps).toEqual([{ title: "2 Tissues", start: 2200, end: 5200 }]);
  });

  it("joins sections too short to be worth a sitting", () => {
    const short = para(STEP_MIN_CHARS) + para(300) + para(300) + para(STEP_MIN_CHARS);
    const steps = planSteps(
      short,
      [
        { title: "A", level: 1, start: 0 },
        { title: "B", level: 1, start: STEP_MIN_CHARS },
        { title: "C", level: 1, start: STEP_MIN_CHARS + 300 },
        { title: "D", level: 1, start: STEP_MIN_CHARS + 600 },
      ],
      "Notes",
    );
    // B and C are too slight to name the step they end up in.
    expect(steps.map((s) => s.title)).toEqual(["A", "D"]);
    expect(steps[1]).toMatchObject({ start: STEP_MIN_CHARS, end: short.length });
  });

  it("cuts a long section into parts at paragraph breaks", () => {
    const long = Array.from({ length: 10 }, () => para(1400)).join("");
    const steps = planSteps(long, [], "Lecture 4");
    expect(steps).toHaveLength(Math.ceil(long.length / STEP_MAX_CHARS));
    expect(steps[0].title).toMatch(/^Lecture 4, part 1 of 3: x+…$/);
    expect(steps.at(-1)!.end).toBe(long.length);
    for (const step of steps) {
      expect(step.end - step.start).toBeLessThanOrEqual(STEP_MAX_CHARS + 1500);
      // Every cut lands just after a paragraph break.
      if (step.end < long.length) expect(long.slice(step.end - 2, step.end)).toBe("\n\n");
    }
  });

  it("names a step after both sections when two of similar size are joined", () => {
    const text = para(700) + para(700);
    const steps = planSteps(
      text,
      [
        { title: "A", level: 1, start: 0 },
        { title: "B", level: 1, start: 700 },
      ],
      "Notes",
    );
    expect(steps).toEqual([{ title: "A → B", start: 0, end: 1400 }]);
  });

  it("returns nothing for an empty range or blank text", () => {
    expect(planSteps(text, outline, "x", { start: 50, end: 50 })).toEqual([]);
    expect(planSteps("   \n\n  ", [], "x")).toEqual([]);
  });
});

describe("readingForToday", () => {
  const steps = (readOn: (string | null)[]) => readOn.map((r, i) => ({ id: `s${i}`, chars: 1000, readOn: r }));

  it("shares what is unread evenly over the days left, end date included", () => {
    // 6 unread steps, 3 days left: 2 a day.
    const plan = readingForToday(steps([null, null, null, null, null, null]), "2026-11-10", "2026-11-12");
    expect(plan.today).toEqual(["s0", "s1"]);
    expect(plan.dailyChars).toBe(2000);
  });

  it("starts after what is already read", () => {
    const plan = readingForToday(steps(["2026-11-08", "2026-11-09", null, null]), "2026-11-10", "2026-11-11");
    expect(plan.today).toEqual(["s2"]);
    expect(plan.readSteps).toBe(2);
  });

  it("is done for the day once today's share has been read", () => {
    const plan = readingForToday(steps(["2026-11-10", "2026-11-10", null, null, null, null]), "2026-11-10", "2026-11-12");
    expect(plan.today).toEqual([]);
    expect(plan.finished).toBe(false);
  });

  it("raises the daily share when behind, instead of keeping a backlog", () => {
    // 6 unread with only 2 days left: 3 a day.
    expect(readingForToday(steps([null, null, null, null, null, null]), "2026-11-11", "2026-11-12").today).toHaveLength(3);
  });

  it("always offers at least one step on a fresh day, and everything on the last day", () => {
    expect(readingForToday(steps([null, null]), "2026-11-01", "2026-11-30").today).toEqual(["s0"]);
    expect(readingForToday(steps([null, null, null]), "2026-11-30", "2026-11-30").today).toHaveLength(3);
    // Past the end date counts as one day left.
    expect(readingForToday(steps([null, null]), "2026-12-05", "2026-11-30").today).toHaveLength(2);
  });

  it("reports a finished track", () => {
    const plan = readingForToday(steps(["2026-11-01"]), "2026-11-10", "2026-11-12");
    expect(plan).toMatchObject({ today: [], finished: true, readSteps: 1, totalSteps: 1 });
  });
});
