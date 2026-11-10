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

/** True when the range covers the whole document, i.e. there is nothing to scope. */
export function isWholeDocument(outline: OutlineSection[], from: number, to: number): boolean {
  return from === 0 && to === outline.length - 1;
}
