// Decides how many revision Q&A pairs to generate from a body of source material, and splits that
// material into chunks small enough that each chunk's questions + answers fit in one LLM response.
// Pure functions — safe to import from client components (used to preview the count in the form).

export const MIN_REVISION_QUESTIONS = 16;
// Bounded by Groq's free-tier rate limit (8k tokens/min): each ~12-question part costs ~4k tokens,
// so 60 questions takes ~3 minutes. Raise both together on a paid tier.
export const MAX_REVISION_QUESTIONS = 60;
// Material beyond this is sampled (evenly across the whole text) rather than sent in full.
export const MAX_REVISION_SOURCE_CHARS = 36_000;

// Roughly one question per ~90 words of material.
const CHARS_PER_QUESTION = 550;
const CHUNK_CHARS = 7_000;
const MAX_CHUNKS = Math.ceil(MAX_REVISION_SOURCE_CHARS / CHUNK_CHARS);
const MIN_PER_CHUNK = 2;

export function revisionQuestionCount(sourceChars: number): number {
  const usable = Math.min(sourceChars, MAX_REVISION_SOURCE_CHARS);
  const byLength = Math.round(usable / CHARS_PER_QUESTION);
  return Math.min(MAX_REVISION_QUESTIONS, Math.max(MIN_REVISION_QUESTIONS, byLength));
}

function splitIntoChunks(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    // A single paragraph longer than a chunk gets hard-split.
    const pieces: string[] = [];
    for (let i = 0; i < paragraph.length; i += CHUNK_CHARS) {
      pieces.push(paragraph.slice(i, i + CHUNK_CHARS));
    }
    for (const piece of pieces) {
      if (current && current.length + piece.length + 2 > CHUNK_CHARS) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export type RevisionChunk = { text: string; count: number };

export function planRevisionChunks(sourceText: string): RevisionChunk[] {
  const text = sourceText.trim();
  if (!text) return [];

  let chunks = splitIntoChunks(text);
  if (chunks.length > MAX_CHUNKS) {
    // Very large material: take evenly spaced chunks so questions span the whole text, not just its start.
    const all = chunks;
    chunks = Array.from({ length: MAX_CHUNKS }, (_, i) => all[Math.floor((i * all.length) / MAX_CHUNKS)]);
  }
  const total = Math.max(revisionQuestionCount(text.length), chunks.length * MIN_PER_CHUNK);
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);

  // Allocate questions in proportion to each chunk's length (largest-remainder rounding),
  // with a small floor so short chunks still get covered.
  const spare = total - chunks.length * MIN_PER_CHUNK;
  const shares = chunks.map((c) => (c.length / totalChars) * spare);
  const counts = shares.map((s) => MIN_PER_CHUNK + Math.floor(s));
  let remaining = total - counts.reduce((a, b) => a + b, 0);
  const byRemainder = shares
    .map((s, i) => ({ i, r: s - Math.floor(s) }))
    .sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    counts[i]++;
    remaining--;
  }

  return chunks.map((chunkText, i) => ({ text: chunkText, count: counts[i] }));
}
