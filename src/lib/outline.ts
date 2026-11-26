import { z } from "zod";

// A document outline: the chapters/sections of a content item, each pointing at the character offset in
// rawText where it starts. Built from PDF bookmarks when the file has them, otherwise from headings
// detected in the text. Pure and dependency-free (besides zod) so the generate form can use it too.

export const outlineSectionSchema = z.object({
  title: z.string(),
  level: z.number().int().min(1),
  start: z.number().int().min(0),
});
export type OutlineSection = z.infer<typeof outlineSectionSchema>;

const MAX_SECTIONS = 300;
const MAX_HEADING_LENGTH = 100;

/** Reads a stored outline, falling back to detecting headings for content saved before outlines existed. */
export function resolveOutline(stored: unknown, rawText: string): OutlineSection[] {
  if (stored != null) {
    const parsed = z.array(outlineSectionSchema).safeParse(stored);
    if (parsed.success) return parsed.data;
  }
  return detectHeadings(rawText);
}

const NUMBER_WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
// "Chapter 5", "UNIT THREE: Cells", "Lecture 4 - Networks", "Topic 2.1"
const KEYWORD_HEADING = new RegExp(
  String.raw`^(chapter|unit|topic|lecture|module|part|section|week|lesson)\s+(\d+(?:\.\d+)*|[ivxlc]+|${NUMBER_WORDS})\b(?:\s*[.:\-–—)]\s*|\s+)?(.*)$`,
  "i",
);
const MARKDOWN_HEADING = /^(#{1,3})\s+(.+?)\s*#*$/;
// "1.18 Data types", "2.3.1 Paging". Needs a dot in the number (so "1. Point" list items never match) and
// a capitalised title that does not end like a sentence (so "3.14 is pi." does not either).
const NUMBERED_HEADING = /^(\d{1,2}(?:\.\d{1,3}){1,3})\.?\s+([A-Z(][^]*)$/;
// Table-of-contents entries end in a page number, often after dot leaders: "Chapter 5 Networks ..... 45"
const TOC_ENTRY = /(?:\.{2,}|…|\s)\s*\d{1,4}$/;

/**
 * Finds chapter-like headings in plain text. Conservative on purpose: a wrong heading is worse than
 * a missing one, because the student then cannot pick a sensible range.
 */
export function detectHeadings(rawText: string): OutlineSection[] {
  const sections: OutlineSection[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (const line of rawText.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;

    const trimmed = line.trim();
    if (!trimmed || trimmed.length > MAX_HEADING_LENGTH) continue;
    const start = lineStart + line.indexOf(trimmed);

    const md = MARKDOWN_HEADING.exec(trimmed);
    if (md) {
      sections.push({ title: md[2], level: md[1].length, start });
      continue;
    }

    const numbered = NUMBERED_HEADING.exec(trimmed);
    if (numbered) {
      const [, number, rest] = numbered;
      const key = `numbered ${number}`;
      if (TOC_ENTRY.test(rest) || /[.,;:]$/.test(rest) || rest.split(" ").length > 12 || seen.has(key)) continue;
      seen.add(key);
      // 1.18 sits under chapter 1 (level 2); 1.18.2 under that.
      sections.push({ title: `${number} ${rest.replace(/\s+/g, " ")}`, level: number.split(".").length, start });
      continue;
    }

    const kw = KEYWORD_HEADING.exec(trimmed);
    if (!kw) continue;
    const [, keyword, number, rest] = kw;
    // "Chapter 5 Networks 45" is a contents entry, not the chapter itself. A bare "Chapter 5" is fine.
    if (rest && TOC_ENTRY.test(rest)) continue;
    // Running headers repeat the chapter title on every page: keep only the first occurrence.
    const key = `${keyword.toLowerCase()} ${number.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // "Section 2.3" sits under a chapter; plain "Section 2" may be top level in some notes, so only
    // dotted numbers are demoted.
    const level = number.includes(".") ? 2 : 1;
    sections.push({ title: trimmed.replace(/\s+/g, " "), level, start });
  }

  return finalizeOutline(sections);
}

/** Sorts, drops duplicates at the same offset, and caps the size. Needs at least two sections to be useful. */
export function finalizeOutline(sections: OutlineSection[]): OutlineSection[] {
  const sorted = [...sections].sort((a, b) => a.start - b.start || a.level - b.level);
  const unique = sorted.filter((s, i) => i === 0 || s.start !== sorted[i - 1].start);
  const capped =
    unique.length > MAX_SECTIONS ? unique.filter((s) => s.level === Math.min(...unique.map((u) => u.level))) : unique;
  return capped.length >= 2 ? capped.slice(0, MAX_SECTIONS) : [];
}

export type SectionRange = { start: number; end: number; label: string };

/**
 * The text span from the start of section `from` to the end of section `to`, inclusive. A section ends
 * where the next section at the same or a higher level begins, so its subsections come with it.
 * When `from` is the first section, the range starts at 0 so any preface before it is kept.
 */
export function sectionRange(
  outline: OutlineSection[],
  textLength: number,
  from: number,
  to: number,
): SectionRange {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= outline.length || from > to) {
    throw new RangeError(`Invalid section range ${from}–${to} for an outline of ${outline.length}`);
  }
  const last = outline[to];
  const next = outline.slice(to + 1).find((s) => s.level <= last.level);
  const start = from === 0 ? 0 : outline[from].start;
  const end = Math.min(next ? next.start : textLength, textLength);
  const label = from === to ? outline[from].title : `${outline[from].title} → ${last.title}`;
  return { start, end, label };
}

/** The last outline index the range from..to covers: `to` itself plus any subsections that follow it. */
export function lastCoveredSection(outline: OutlineSection[], to: number): number {
  let last = to;
  while (last + 1 < outline.length && isWithin(outline, last + 1, to)) last++;
  return last;
}

export type TextSpan = { start: number; end: number };
export type SectionScope = { range: SectionRange; excluded: TextSpan[]; label: string };

/**
 * A section range with some sections left out, e.g. chapters 1-5 without 1.18. Leaving out a section
 * also leaves out its subsections. `exclude` holds outline indices inside the range, which includes the
 * subsections of `to` (see lastCoveredSection).
 */
export function sectionScope(
  outline: OutlineSection[],
  textLength: number,
  from: number,
  to: number,
  exclude: number[] = [],
): SectionScope {
  const range = sectionRange(outline, textLength, from, to);
  const leftOut = [...new Set(exclude)].sort((a, b) => a - b);
  const last = lastCoveredSection(outline, to);
  for (const i of leftOut) {
    if (!Number.isInteger(i) || i < from || i > last) {
      throw new RangeError(`Section ${i} is outside the chosen range ${from}–${to}`);
    }
  }

  // Merge overlapping spans: leaving out 1.18 and its child 1.18.2 is one cut, not two.
  const excluded: TextSpan[] = [];
  for (const i of leftOut) {
    // From the heading itself, so leaving out the first section keeps any preface before it.
    const { end } = sectionRange(outline, textLength, i, i);
    const span = { start: Math.max(outline[i].start, range.start), end: Math.min(end, range.end) };
    const last = excluded.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else if (span.end > span.start) excluded.push(span);
  }

  // Name only the top-most sections left out; their subsections go without saying.
  const named = leftOut.filter((i) => !leftOut.some((j) => j < i && isWithin(outline, i, j)));
  const titles = named.map((i) => outline[i].title);
  const label =
    titles.length === 0
      ? range.label
      : `${range.label}, leaving out ${titles.length <= 3 ? titles.join(", ") : `${titles.length} sections`}`;
  return { range, excluded, label };
}

/** True when section `child` is a subsection (at any depth) of section `parent`. */
export function isWithin(outline: OutlineSection[], child: number, parent: number): boolean {
  if (child <= parent) return false;
  for (let i = parent + 1; i <= child; i++) {
    if (outline[i].level <= outline[parent].level) return false;
  }
  return true;
}

/** The pieces of [start, end) that remain once the excluded spans are cut out. */
export function keptSpans(start: number, end: number, excluded: TextSpan[]): TextSpan[] {
  const kept: TextSpan[] = [];
  let cursor = start;
  for (const cut of [...excluded].sort((a, b) => a.start - b.start)) {
    if (cut.start > cursor) kept.push({ start: cursor, end: Math.min(cut.start, end) });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < end) kept.push({ start: cursor, end });
  return kept.filter((s) => s.end > s.start);
}

/** True when the range covers the whole document, i.e. there is nothing to scope. */
export function isWholeDocument(outline: OutlineSection[], from: number, to: number): boolean {
  return from === 0 && to === outline.length - 1;
}
