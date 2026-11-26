import type { OutlineSection } from "@/lib/outline";

// The study plan: turning a document into readable steps and spreading them over the days the student
// has. Pure functions only (no database), so the rules are easy to test and the forms can use them too.

// ---- Days ----
// A study day is a calendar day in the server's local time zone, written "YYYY-MM-DD". Strings in that
// form sort and compare correctly, so `a <= b` works on them.

export function toDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Midnight at the start of the given day, local time. */
export function dayToDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && toDay(dayToDate(day)) === day;
}

export function addDays(day: string, days: number): string {
  const date = dayToDate(day);
  return toDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = dayToDate(from);
  const b = dayToDate(to);
  // UTC arithmetic on the calendar fields, so a daylight-saving change cannot make a day 23 hours long.
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86_400_000,
  );
}

export type TrackPhase = "upcoming" | "active" | "finished";

export function trackPhase(track: { startDate: string; endDate: string }, today: string): TrackPhase {
  if (today < track.startDate) return "upcoming";
  if (today > track.endDate) return "finished";
  return "active";
}

// ---- Steps ----

export type PlannedStep = { title: string; start: number; end: number };

// A step is one sitting of reading and one prompt's worth of source for writing questions.
// Shorter sections are joined to their neighbours; longer ones are cut into parts.
export const STEP_MIN_CHARS = 1_200;
export const STEP_MAX_CHARS = 6_000;

/** Roughly how fast study reading goes, for "about N minutes a day" estimates. */
export const READING_CHARS_PER_MINUTE = 900;

/**
 * Cuts the part of a document between `range.start` and `range.end` into steps, following its outline.
 * Every character of the range ends up in exactly one step, in reading order.
 */
export function planSteps(
  rawText: string,
  outline: OutlineSection[],
  fallbackTitle: string,
  range?: { start: number; end: number },
): PlannedStep[] {
  const lo = Math.max(0, range?.start ?? 0);
  const hi = Math.min(range?.end ?? rawText.length, rawText.length);
  if (hi <= lo) return [];

  // 1. One segment per outline section that starts inside the range, plus whatever comes before the first.
  const inside = outline.filter((s) => s.start > lo && s.start < hi);
  const opening = [...outline].reverse().find((s) => s.start <= lo);
  const marks: { start: number; title: string | null }[] = [
    { start: lo, title: opening?.title ?? null },
    ...inside.map((s) => ({ start: s.start, title: s.title })),
  ];
  const segments = marks.map((m, i) => ({ ...m, end: marks[i + 1]?.start ?? hi }));

  // 2. Join short segments to the ones after them until each piece is worth sitting down for.
  type Piece = { start: number; end: number; parts: { title: string; chars: number }[] };
  const pieces: Piece[] = [];
  let current: Piece | null = null;
  for (const segment of segments) {
    if (!current) current = { start: segment.start, end: segment.end, parts: [] };
    current.end = segment.end;
    if (segment.title) current.parts.push({ title: segment.title, chars: segment.end - segment.start });
    if (current.end - current.start >= STEP_MIN_CHARS) {
      pieces.push(current);
      current = null;
    }
  }
  if (current) {
    const previous = pieces.at(-1);
    if (previous) {
      previous.end = current.end;
      previous.parts.push(...current.parts);
    } else {
      pieces.push(current);
    }
  }

  // 3. Cut long pieces into parts, at paragraph breaks where there are any.
  const steps: PlannedStep[] = [];
  for (const piece of pieces) {
    if (!rawText.slice(piece.start, piece.end).trim()) continue;
    const length = piece.end - piece.start;
    const title = pieceTitle(piece.parts, length) ?? fallbackTitle;

    const parts = Math.ceil(length / STEP_MAX_CHARS);
    if (parts <= 1) {
      steps.push({ title, start: piece.start, end: piece.end });
      continue;
    }
    let from = piece.start;
    for (let part = 1; part <= parts; part++) {
      const target = piece.start + Math.round((length * part) / parts);
      const to = part === parts ? piece.end : Math.max(breakNear(rawText, target), from + 1);
      // Parts have no heading of their own, so their opening words say where in the document they are.
      const opens = openingWords(rawText.slice(from, to));
      steps.push({ title: `${title}, part ${part} of ${parts}${opens ? `: ${opens}` : ""}`, start: from, end: to });
      from = to;
    }
  }
  return steps;
}

/**
 * Names a piece after the sections that make up most of it: a heading with only a line or two under
 * it (a chapter title straight before its first section, say) does not get a mention.
 */
function pieceTitle(parts: { title: string; chars: number }[], length: number): string | null {
  if (parts.length === 0) return null;
  const main = parts.filter((p) => p.chars >= length / 4);
  const named = main.length > 0 ? main : [parts.reduce((a, b) => (b.chars > a.chars ? b : a))];
  const first = named[0].title;
  const last = named.at(-1)!.title;
  return first === last ? first : `${first} → ${last}`;
}

const OPENING_MAX_CHARS = 48;

function openingWords(text: string): string {
  const line = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find((l) => l.length > 3) ?? "";
  if (line.length <= OPENING_MAX_CHARS) return line;
  const cut = line.slice(0, OPENING_MAX_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20))}…`;
}

/** The nearest paragraph break (failing that, line or sentence break) shortly before `position`. */
function breakNear(text: string, position: number): number {
  const WINDOW = STEP_MAX_CHARS / 4;
  const from = Math.max(0, position - WINDOW);
  const before = text.slice(from, position);
  for (const separator of ["\n\n", "\n", ". "]) {
    const found = before.lastIndexOf(separator);
    if (found > 0) return from + found + separator.length;
  }
  return position;
}

// ---- Pace ----

export type StepProgress = { id: string; chars: number; readOn: string | null };

export type ReadingPlan = {
  /** Steps to read today, in order. Empty when today's share is done or everything is read. */
  today: string[];
  /** Today's share of the reading, in characters (what is left, spread evenly over the days left). */
  dailyChars: number;
  readSteps: number;
  totalSteps: number;
  finished: boolean;
};

/**
 * Today's reading for one track. The pace adapts: whatever is still unread is spread evenly over the
 * days left (today and the end date included), so falling behind raises the daily share a little
 * instead of piling up a backlog, and reading ahead lowers it.
 */
export function readingForToday(steps: StepProgress[], today: string, endDate: string): ReadingPlan {
  const unread = steps.filter((s) => s.readOn === null);
  const readToday = steps.filter((s) => s.readOn === today).reduce((sum, s) => sum + s.chars, 0);
  const unreadChars = unread.reduce((sum, s) => sum + s.chars, 0);
  const daysLeft = Math.max(1, daysBetween(today, endDate) + 1);
  const dailyChars = (unreadChars + readToday) / daysLeft;

  const todo: string[] = [];
  let planned = readToday;
  for (const step of unread) {
    // Take a step if at least half of it fits in today's share; always take one on a fresh day.
    const fits = planned + step.chars / 2 <= dailyChars;
    if (!fits && (planned > 0 || todo.length > 0)) break;
    todo.push(step.id);
    planned += step.chars;
  }

  return {
    today: todo,
    dailyChars: Math.round(dailyChars),
    readSteps: steps.length - unread.length,
    totalSteps: steps.length,
    finished: unread.length === 0,
  };
}

export function readingMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / READING_CHARS_PER_MINUTE));
}
