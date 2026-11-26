import { describe, expect, it } from "vitest";
import {
  detectHeadings,
  isWholeDocument,
  keptSpans,
  lastCoveredSection,
  resolveOutline,
  sectionRange,
  sectionScope,
} from "@/lib/outline";

const notes = [
  "Contents",
  "Chapter 1 Introduction ........ 3",
  "Chapter 2 Cells 9",
  "",
  "Chapter 1: Introduction",
  "Biology is the study of life.",
  "Chapter 1: Introduction", // running header on the next page
  "More intro.",
  "CHAPTER TWO - Cells",
  "Section 2.1 Membranes",
  "Membranes are lipid bilayers.",
  "Chapter 3",
  "Genetics text.",
].join("\n");

describe("detectHeadings", () => {
  const outline = detectHeadings(notes);

  it("finds chapter headings and skips table-of-contents entries and running headers", () => {
    expect(outline.map((s) => [s.title, s.level])).toEqual([
      ["Chapter 1: Introduction", 1],
      ["CHAPTER TWO - Cells", 1],
      ["Section 2.1 Membranes", 2],
      ["Chapter 3", 1],
    ]);
  });

  it("points each section at the start of its heading line", () => {
    for (const s of outline) expect(notes.slice(s.start).startsWith(s.title)).toBe(true);
  });

  it("reads Markdown headings in pasted notes", () => {
    const md = "# Networks\nintro\n## TCP\nreliable\n# Security\nkeys";
    expect(detectHeadings(md).map((s) => [s.title, s.level])).toEqual([
      ["Networks", 1],
      ["TCP", 2],
      ["Security", 1],
    ]);
  });

  it("returns nothing when there is not at least two sections to choose between", () => {
    expect(detectHeadings("Chapter 1\nonly one chapter here")).toEqual([]);
    expect(detectHeadings("1. a numbered point\n2. another point")).toEqual([]);
  });
});

describe("sectionRange", () => {
  const outline = detectHeadings(notes);

  it("starts at 0 from the first section so the preface is kept, and ends where the next chapter begins", () => {
    const range = sectionRange(outline, notes.length, 0, 1);
    expect(range.start).toBe(0);
    expect(notes.slice(range.start, range.end)).toContain("Membranes are lipid bilayers.");
    expect(notes.slice(range.start, range.end)).not.toContain("Genetics");
    expect(range.label).toBe("Chapter 1: Introduction → CHAPTER TWO - Cells");
  });

  it("includes a chapter's subsections when it is the last one picked", () => {
    const { start, end, label } = sectionRange(outline, notes.length, 1, 1);
    expect(notes.slice(start, end)).toMatch(/^CHAPTER TWO - Cells[\s\S]*lipid bilayers\.\n$/);
    expect(label).toBe("CHAPTER TWO - Cells");
  });

  it("runs to the end of the text from the last section", () => {
    expect(sectionRange(outline, notes.length, 3, 3).end).toBe(notes.length);
  });

  it("rejects ranges that do not fit the outline", () => {
    expect(() => sectionRange(outline, notes.length, 2, 1)).toThrow(RangeError);
    expect(() => sectionRange(outline, notes.length, 0, 4)).toThrow(RangeError);
  });

  it("knows when a range is the whole document", () => {
    expect(isWholeDocument(outline, 0, 3)).toBe(true);
    expect(isWholeDocument(outline, 0, 2)).toBe(false);
  });
});

describe("resolveOutline", () => {
  it("uses a stored outline when it is valid", () => {
    const stored = [
      { title: "A", level: 1, start: 0 },
      { title: "B", level: 1, start: 5 },
    ];
    expect(resolveOutline(stored, "whatever")).toEqual(stored);
  });

  it("falls back to detecting headings for older content without one", () => {
    expect(resolveOutline(null, notes)).toEqual(detectHeadings(notes));
    expect(resolveOutline("garbage", notes)).toEqual(detectHeadings(notes));
  });
});

const numbered = [
  "Chapter 1 Data",
  "1.17 Arrays",
  "Arrays hold items.",
  "1.18 Pointers",
  "Pointers hold addresses.",
  "1.18.1 Pointer arithmetic",
  "Add to a pointer.",
  "1.19 Structs",
  "Structs group fields.",
  "Chapter 2 Control",
  "Loops.",
].join("\n");

describe("numbered subtopic headings", () => {
  it("finds 1.18-style headings, nested by how many parts the number has", () => {
    expect(detectHeadings(numbered).map((s) => [s.title, s.level])).toEqual([
      ["Chapter 1 Data", 1],
      ["1.17 Arrays", 2],
      ["1.18 Pointers", 2],
      ["1.18.1 Pointer arithmetic", 3],
      ["1.19 Structs", 2],
      ["Chapter 2 Control", 1],
    ]);
  });

  it("ignores numbered list points, decimals in sentences and contents entries", () => {
    const text = [
      "Chapter 1 Data",
      "1. First point",
      "3.14 is roughly pi.",
      "2.1 Memory 12",
      "1.5 Marks each, for a full answer.",
      "Chapter 2 Control",
    ].join("\n");
    expect(detectHeadings(text).map((s) => s.title)).toEqual(["Chapter 1 Data", "Chapter 2 Control"]);
  });
});

describe("sectionScope", () => {
  const outline = detectHeadings(numbered);
  const textOf = (from: number, to: number, exclude: number[]) => {
    const { range, excluded } = sectionScope(outline, numbered.length, from, to, exclude);
    return keptSpans(range.start, range.end, excluded)
      .map((s) => numbered.slice(s.start, s.end))
      .join("");
  };

  it("leaves out a subtopic and its own subsections", () => {
    const text = textOf(0, 0, [2]);
    expect(text).toContain("Arrays hold items.");
    expect(text).toContain("Structs group fields.");
    expect(text).not.toContain("Pointers");
    expect(text).not.toContain("Add to a pointer.");
    expect(text).not.toContain("Loops.");
  });

  it("names only the top-most sections left out", () => {
    expect(sectionScope(outline, numbered.length, 0, 0, [2, 3]).label).toBe(
      "Chapter 1 Data, leaving out 1.18 Pointers",
    );
    expect(sectionScope(outline, numbered.length, 0, 0, [2, 3]).excluded).toHaveLength(1);
  });

  it("counts the subsections of the last chapter as inside the range", () => {
    expect(lastCoveredSection(outline, 0)).toBe(4);
    expect(() => sectionScope(outline, numbered.length, 0, 0, [5])).toThrow(RangeError);
  });
});

describe("keptSpans", () => {
  it("cuts the excluded spans out of a range", () => {
    expect(
      keptSpans(0, 100, [
        { start: 50, end: 60 },
        { start: 10, end: 20 },
      ]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 50 },
      { start: 60, end: 100 },
    ]);
    expect(keptSpans(0, 10, [{ start: 0, end: 10 }])).toEqual([]);
  });
});
