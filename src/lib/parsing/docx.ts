import mammoth from "mammoth";
import { withTimeout } from "@/lib/withTimeout";

const EXTRACTION_TIMEOUT_MS = 30_000;

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const result = await withTimeout(
    mammoth.extractRawText({ buffer: Buffer.from(buffer) }),
    EXTRACTION_TIMEOUT_MS,
    "DOCX text extraction",
  );
  return result.value.trim();
}
