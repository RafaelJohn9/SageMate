import { PDFParse } from "pdf-parse";
import { withTimeout } from "@/lib/withTimeout";
import { detectHeadings, finalizeOutline, type OutlineSection } from "@/lib/outline";

const EXTRACTION_TIMEOUT_MS = 30_000;
const MAX_BOOKMARK_DEPTH = 3;

export type ExtractedPdf = { text: string; outline: OutlineSection[] };

type BookmarkNode = { title: string; dest: string | unknown[] | null; items: BookmarkNode[] };
// The subset of PDF.js' document proxy needed to turn a bookmark destination into a page number.
type PdfDocument = {
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
};

/**
 * Extracts the text and an outline. The outline comes from the PDF's bookmarks when it has them (the
 * reliable source: it is the table of contents the author built), otherwise from headings in the text.
 */
export async function extractPdf(buffer: ArrayBuffer): Promise<ExtractedPdf> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    return await withTimeout(extract(parser), EXTRACTION_TIMEOUT_MS, "PDF text extraction");
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extract(parser: PDFParse): Promise<ExtractedPdf> {
  const result = await parser.getText();

  // Rebuild the text the way pdf-parse joins pages so we know where each page starts.
  let joined = "";
  const pageStarts = new Map<number, number>();
  for (const page of result.pages) {
    pageStarts.set(page.num, joined.length);
    joined += `${page.text}\n-- ${page.num} of ${result.total} --\n\n`;
  }
  const leading = joined.length - joined.trimStart().length;
  const text = joined.trim();
  const pages = result.pages.map((p) => ({ num: p.num, start: (pageStarts.get(p.num) ?? 0) - leading, text: p.text }));

  const bookmarks = await readBookmarkOutline(parser, pages).catch(() => []);
  return { text, outline: bookmarks.length > 0 ? bookmarks : detectHeadings(text) };
}

async function readBookmarkOutline(
  parser: PDFParse,
  pages: { num: number; start: number; text: string }[],
): Promise<OutlineSection[]> {
  const info = await parser.getInfo();
  const roots = (info.outline ?? []) as BookmarkNode[];
  if (roots.length === 0) return [];

  // pdf-parse keeps the loaded PDF.js document private; getInfo() has loaded it, and we need it to map
  // bookmark destinations to page numbers.
  const doc = (parser as unknown as { doc?: PdfDocument }).doc;
  if (!doc) return [];

  const sections: OutlineSection[] = [];
  async function walk(nodes: BookmarkNode[], level: number) {
    for (const node of nodes) {
      const pageNum = await destinationPage(doc!, node.dest);
      const page = pageNum != null ? pages.find((p) => p.num === pageNum) : undefined;
      const title = node.title.replace(/\s+/g, " ").trim();
      if (page && title) {
        sections.push({ title, level, start: Math.max(0, page.start + offsetInPage(page.text, title)) });
      }
      if (level < MAX_BOOKMARK_DEPTH && node.items?.length) await walk(node.items, level + 1);
    }
  }
  await walk(roots, 1);
  return finalizeOutline(sections);
}

async function destinationPage(doc: PdfDocument, dest: BookmarkNode["dest"]): Promise<number | null> {
  const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(explicit) || explicit.length === 0) return null;
  const target = explicit[0];
  // A destination points at a page either by object reference or (rarely) by a zero-based index.
  const index = typeof target === "number" ? target : await doc.getPageIndex(target);
  return index + 1;
}

/** Where the bookmark's title appears on its page, so several sections on one page stay distinct. */
function offsetInPage(pageText: string, title: string): number {
  const haystack = pageText.toLowerCase();
  const exact = haystack.indexOf(title.toLowerCase());
  if (exact >= 0) return exact;
  // Titles often lose their number or punctuation in the text layer; try the first few words.
  const words = title.toLowerCase().split(" ").slice(0, 4).join(" ");
  const partial = words.length >= 6 ? haystack.indexOf(words) : -1;
  return partial >= 0 ? partial : 0;
}
