import { createElement as h } from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { extractPdf } from "@/lib/parsing/pdf";

async function pdf(withBookmarks: boolean): Promise<ArrayBuffer> {
  // `bookmark` works at runtime but is missing from the component prop types.
  const mark = (title: string) => (withBookmarks ? ({ bookmark: { title } } as Record<string, unknown>) : null);
  // react-pdf nests a bookmark under the bookmark of the element that contains it.
  const chapter = (n: number, body: string, sub?: string) =>
    h(
      Page,
      { key: n },
      h(
        View,
        mark(`Chapter ${n}`),
        h(Text, null, `Chapter ${n}`),
        h(Text, null, body),
        sub ? h(Text, mark(sub), sub) : null,
      ),
    );
  const buffer = await renderToBuffer(
    h(
      Document,
      null,
      h(Page, null, h(Text, null, "Course notes")),
      chapter(1, "Atoms and molecules."),
      chapter(2, "Cells are the unit of life.", "Membranes"),
      chapter(3, "Genes carry information."),
    ),
  );
  return new Uint8Array(buffer).buffer;
}

describe("extractPdf", () => {
  it("builds the outline from bookmarks, pointing each section at its text", async () => {
    const { text, outline } = await extractPdf(await pdf(true));

    expect(outline.map((s) => [s.title, s.level])).toEqual([
      ["Chapter 1", 1],
      ["Chapter 2", 1],
      ["Membranes", 2],
      ["Chapter 3", 1],
    ]);
    for (const s of outline) expect(text.slice(s.start).startsWith(s.title)).toBe(true);
  });

  it("falls back to headings in the text when the PDF has no bookmarks", async () => {
    const { outline } = await extractPdf(await pdf(false));
    expect(outline.map((s) => s.title)).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
  });
});
