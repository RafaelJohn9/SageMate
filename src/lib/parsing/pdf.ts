import { PDFParse } from "pdf-parse";
import { withTimeout } from "@/lib/withTimeout";

const EXTRACTION_TIMEOUT_MS = 30_000;

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await withTimeout(parser.getText(), EXTRACTION_TIMEOUT_MS, "PDF text extraction");
    return result.text.trim();
  } finally {
    await parser.destroy().catch(() => {});
  }
}
