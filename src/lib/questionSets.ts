import { z } from "zod";
import { db } from "@/lib/db";
import { isWholeDocument, keptSpans, resolveOutline, sectionScope, type TextSpan } from "@/lib/outline";

type SourceContent = { title: string; rawText: string };
type StoredRange = {
  rangeStart: number | null;
  rangeEnd: number | null;
  rangeLabel: string | null;
  rangeExcluded?: unknown;
};
type ResolvedRange = { rangeStart: number; rangeEnd: number; rangeLabel: string; rangeExcluded?: TextSpan[] };

const spansSchema = z.array(z.object({ start: z.number().int(), end: z.number().int() }));

/** One source as the LLM sees it: a heading naming the content (and the chapters, when scoped) and its text. */
export function formatSource(content: SourceContent, range?: StoredRange | null): string {
  if (range?.rangeStart == null || range.rangeEnd == null) {
    return `## ${content.title}\n${content.rawText}`;
  }
  const label = range.rangeLabel ? ` (${range.rangeLabel})` : "";
  const excluded = spansSchema.safeParse(range.rangeExcluded ?? []);
  const text = keptSpans(range.rangeStart, range.rangeEnd, excluded.success ? excluded.data : [])
    .map(({ start, end }) => content.rawText.slice(start, end).trim())
    .filter(Boolean)
    .join("\n\n");
  return `## ${content.title}${label}\n${text}`;
}

/**
 * Turns a requested section range (indices into the content's outline, plus sections to leave out) into
 * the stored rawText slice. Returns null when there is nothing to scope: no range asked for, or it
 * covers the whole document with nothing left out. Throws a RangeError when the indices do not fit.
 */
export function resolveContentRange(
  content: SourceContent & { outline: unknown },
  requested: { from: number; to: number; exclude?: number[] } | undefined,
): ResolvedRange | null {
  if (!requested) return null;
  const outline = resolveOutline(content.outline, content.rawText);
  if (outline.length === 0) throw new RangeError(`"${content.title}" has no chapters or sections to choose from`);
  if (requested.to >= outline.length) throw new RangeError(`"${content.title}" has only ${outline.length} sections`);
  const exclude = requested.exclude ?? [];
  if (isWholeDocument(outline, requested.from, requested.to) && exclude.length === 0) return null;

  const { range, excluded, label } = sectionScope(
    outline,
    content.rawText.length,
    requested.from,
    requested.to,
    exclude,
  );
  if (keptSpans(range.start, range.end, excluded).length === 0) {
    throw new RangeError(`Every section of "${content.title}" in that range is left out`);
  }
  return {
    rangeStart: range.start,
    rangeEnd: range.end,
    rangeLabel: label,
    ...(excluded.length > 0 ? { rangeExcluded: excluded } : {}),
  };
}

export async function getQuestionSetSourceText(questionSetId: string): Promise<string> {
  const sourceContent = await db.questionSetContent.findMany({
    where: { questionSetId },
    include: { content: true },
  });
  return sourceContent.map((sc) => formatSource(sc.content, sc)).join("\n\n");
}
