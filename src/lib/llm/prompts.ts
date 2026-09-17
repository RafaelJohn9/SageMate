import type { GenerateQuestionsInput, GradeAnswerBatchItem, GradeAnswerInput } from "./types";

const MAX_SOURCE_CHARS = 12000;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[...truncated, source material continues beyond this point...]`;
}

export function buildGenerateQuestionsPrompt(input: GenerateQuestionsInput): {
  system: string;
  user: string;
} {
  const applicationCount = input.count > 2 ? 2 : 0;
  const conceptualCount = input.count - applicationCount;

  const system = [
    "You are an experienced exam question setter creating open-ended, free-response revision questions.",
    "Questions must never include multiple-choice options — they are answered in prose by the student.",
    "Return ONLY strict JSON matching the requested schema. No prose, no markdown fences.",
  ].join(" ");

  const pastPaperSection = input.pastPaperText
    ? `PAST PAPER EXAMPLES (style reference only — do NOT copy or closely paraphrase any of these questions):\n${truncate(
        input.pastPaperText,
        MAX_SOURCE_CHARS,
      )}`
    : "(No past paper examples were provided — use a standard, clear essay-question style.)";

  const user = `
UNIT: ${input.unitTitle}
PURPOSE: ${input.purpose}

SOURCE NOTES:
${truncate(input.notesText, MAX_SOURCE_CHARS)}

${pastPaperSection}

TASK:
1. If past paper examples were provided above, first analyze them internally to infer typical
   phrasing/command verbs (e.g. "Discuss", "Differentiate between", "Explain with examples"),
   structural conventions, recurring topic emphasis, and difficulty level. Shape the style of the
   new questions to match these inferred patterns.
2. Generate exactly ${input.count} open-ended essay-style questions grounded in the SOURCE NOTES,
   scoped to purpose "${input.purpose}".
3. The first ${conceptualCount} questions must be CONCEPTUAL (recall, explain, compare, describe).
${applicationCount > 0 ? `4. The final ${applicationCount} questions must be APPLICATION questions — apply a concept from the notes to a concrete scenario, problem, or case (not pure recall).` : ""}
5. Do not copy or closely paraphrase any past paper question verbatim.

Return ONLY a JSON object of this exact shape:
{"questions": [{"text": string, "questionType": "CONCEPTUAL" | "APPLICATION"}, ...]}
The "questions" array must contain exactly ${input.count} items, in the order described above.
`.trim();

  return { system, user };
}

export function buildGradeAnswerPrompt(input: GradeAnswerInput): { system: string; user: string } {
  const system = [
    "You are a fair, rigorous grader for open-ended exam/revision answers.",
    "Judge the student's answer against the source material for correctness and completeness.",
    "Return ONLY strict JSON matching the requested schema. No prose, no markdown fences.",
  ].join(" ");

  const user = `
SOURCE MATERIAL (grounding context):
${truncate(input.sourceText, MAX_SOURCE_CHARS)}

QUESTION:
${input.questionText}

STUDENT ANSWER:
${input.answerText}

Grade the student answer from 0-100 and give constructive feedback explaining what was right,
what was missing or incorrect, and how to improve. Include a concise correct/model answer.

Return ONLY a JSON object of this exact shape:
{"score": number, "feedback": string, "modelAnswer": string}
`.trim();

  return { system, user };
}

export function buildGradeAnswerBatchPrompt(items: GradeAnswerBatchItem[]): {
  system: string;
  user: string;
} {
  const system = [
    "You are a fair, rigorous grader for open-ended exam/revision answers.",
    "You will grade multiple question/answer pairs in one pass. Judge each against its own source material.",
    "Return ONLY strict JSON matching the requested schema. No prose, no markdown fences.",
  ].join(" ");

  const itemsBlock = items
    .map(
      (item, i) => `--- ITEM ${i + 1} (refId: "${item.refId}") ---
SOURCE MATERIAL:
${truncate(item.sourceText, Math.floor(MAX_SOURCE_CHARS / items.length) || 500)}

QUESTION:
${item.questionText}

STUDENT ANSWER:
${item.answerText}`,
    )
    .join("\n\n");

  const user = `
Grade each of the following ${items.length} question/answer pairs independently, from 0-100, with
constructive feedback and a concise model answer for each.

${itemsBlock}

Return ONLY a JSON object of this exact shape:
{"results": [{"refId": string, "score": number, "feedback": string, "modelAnswer": string}, ...]}
The "results" array must contain exactly one entry per item above, using the same "refId" values.
`.trim();

  return { system, user };
}
