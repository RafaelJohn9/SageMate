import { db } from "@/lib/db";
import { isWholeDocument, resolveOutline, sectionRange } from "@/lib/outline";

type SourceContent = { title: string; rawText: string };
type StoredRange = { rangeStart: number | null; rangeEnd: number | null; rangeLabel: string | null };

/** One source as the LLM sees it: a heading naming the content (and the chapters, when scoped) and its text. */
export function formatSource(content: SourceContent, range?: StoredRange | null): string {
  if (range?.rangeStart == null || range.rangeEnd == null) {
    return `## ${content.title}\n${content.rawText}`;
  }
  const label = range.rangeLabel ? ` (${range.rangeLabel})` : "";
  return `## ${content.title}${label}\n${content.rawText.slice(range.rangeStart, range.rangeEnd).trim()}`;
}

/**
 * Turns a requested section range (indices into the content's outline) into the stored rawText slice.
 * Returns null when there is nothing to scope: no range asked for, or it covers the whole document.
 * Throws a RangeError when the indices do not fit the outline.
 */
export function resolveContentRange(
  content: SourceContent & { outline: unknown },
  requested: { from: number; to: number } | undefined,
): StoredRange | null {
  if (!requested) return null;
  const outline = resolveOutline(content.outline, content.rawText);
  if (outline.length === 0) throw new RangeError(`"${content.title}" has no chapters or sections to choose from`);
  if (requested.to >= outline.length) throw new RangeError(`"${content.title}" has only ${outline.length} sections`);
  if (isWholeDocument(outline, requested.from, requested.to)) return null;
  const { start, end, label } = sectionRange(outline, content.rawText.length, requested.from, requested.to);
  return { rangeStart: start, rangeEnd: end, rangeLabel: label };
}

export async function getQuestionSetSourceText(questionSetId: string): Promise<string> {
  const sourceContent = await db.questionSetContent.findMany({
    where: { questionSetId },
    include: { content: true },
  });
  return sourceContent.map((sc) => formatSource(sc.content, sc)).join("\n\n");
}
