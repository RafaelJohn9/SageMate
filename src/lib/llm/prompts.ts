import type {
  DiscussAnswerInput,
  ExtractQuestionsInput,
  GenerateQuestionsInput,
  GenerateRevisionQAInput,
  GradeAnswerBatchItem,
  GradeAnswerInput,
} from "./types";

const MAX_SOURCE_CHARS = 12000;
const MAX_EXTRACT_SOURCE_CHARS = 30000;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[...truncated, source material continues beyond this point...]`;
}

const MARKING_SCHEME_RULES = `
MARKING SCHEME RULES (assign marks per question following exam-marking convention):
- "Differentiate between" / "Distinguish between" / "Compare" questions: 2 marks per point of
  difference (1 mark for correctly stating the point, 1 mark for explaining/elaborating it).
- "Explain" / "Discuss" / "Describe" / "Analyze" / "Evaluate" / "Justify" questions: 2 marks per
  point (1 mark for stating the point, 1 mark for its explanation).
- "Outline" / "List" / "State" / "Identify" questions: 1 mark per point (no explanation required).
- Application questions: apply the same convention based on the question's own command verb and
  the number of distinct points a full answer requires.
Decide how many points a complete answer needs (typically 2-4, grounded in the source material's
depth on that topic), then compute marks = points × marks-per-point per the rules above.
Write a concise "markingScheme" string describing the breakdown, e.g. "4 marks: 2 points of
difference x 2 marks each (1 for the point, 1 for its explanation)" or "3 marks: 3 points x 1 mark
each". This is shown to the student to help them structure a complete answer.
`.trim();

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

  const priorQuestionsSection =
    input.priorQuestions && input.priorQuestions.length > 0
      ? `PREVIOUSLY ASKED QUESTIONS FOR THIS UNIT (across earlier revision sets):\n${input.priorQuestions
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}`
      : "(No prior questions recorded for this unit yet.)";

  const user = `
UNIT: ${input.unitTitle}
PURPOSE: ${input.purpose}

SOURCE NOTES:
${truncate(input.notesText, MAX_SOURCE_CHARS)}

${pastPaperSection}

${priorQuestionsSection}

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
6. Check the PREVIOUSLY ASKED QUESTIONS list above. Do not repeat any of them near-verbatim. Some
   topic overlap across revision sets is fine and expected — the same concept can reasonably be
   tested again. But if a topic or command-verb/phrasing pattern already appears several times in
   that list, take a noticeably different, more creative angle this time: a different sub-aspect,
   a different scenario or example, a different depth, or a different command verb — rather than
   rephrasing the same question.

${MARKING_SCHEME_RULES}

Return ONLY a JSON object of this exact shape:
{"questions": [{"text": string, "questionType": "CONCEPTUAL" | "APPLICATION", "marks": number, "markingScheme": string}, ...]}
The "questions" array must contain exactly ${input.count} items, in the order described above.
`.trim();

  return { system, user };
}

export function buildExtractQuestionsPrompt(input: ExtractQuestionsInput): {
  system: string;
  user: string;
} {
  const system = [
    "You extract exam/revision questions that already appear in a student's study material.",
    "You never invent new questions — you only pull out questions that are written in the source.",
    "Return ONLY strict JSON matching the requested schema. No prose, no markdown fences.",
  ].join(" ");

  const user = `
UNIT: ${input.unitTitle}

SOURCE MATERIAL:
${truncate(input.sourceText, MAX_EXTRACT_SOURCE_CHARS)}

TASK:
1. Find every question already written in the SOURCE MATERIAL above (e.g. numbered exam questions,
   end-of-topic questions, review/revision questions, "Discuss…", "Explain…", "What is…?").
   Ignore the explanatory notes, answers, and worked solutions — take the questions only.
2. Copy each question's wording as written. Only clean it up: remove the leading number/letter
   (e.g. "1.", "Q3", "(b)") and any trailing marks annotation (e.g. "(4 marks)", "[6mks]"), and fix
   obvious text-extraction artefacts such as broken line wraps.
3. Every question must make sense on its own. A question often starts with one or more context
   sentences BEFORE the command verb — copy the WHOLE question, starting from its first sentence,
   not just from the command verb. Also include any scenario, case study, or data it refers to
   (e.g. "Task A", "the company above"). Never leave a dangling reference like "this transaction".
   Do not include section or question headings/titles (e.g. "Question 2: The Economics of X").
   Example — source:
     "Question 2: Asset Sales
      When a company sells assets to a vendor at book value, the price is often above market value.
      Explain the financial mechanism of this transaction."
   Correct text: "When a company sells assets to a vendor at book value, the price is often above
   market value. Explain the financial mechanism of this transaction."
   Wrong text: "Explain the financial mechanism of this transaction."
   If a question has sub-parts, output each sub-part as its own question, each prefixed with the
   shared stem/scenario.
4. Skip exam instructions (e.g. "Answer ALL questions", "Time: 2 hours") and exact duplicates.
5. Keep the questions in the order they appear in the source.
6. Classify each as "CONCEPTUAL" (recall, explain, compare, describe) or "APPLICATION" (apply a
   concept to a scenario, case, problem, or calculation).
7. If the source shows marks for a question, use exactly those marks. Otherwise assign marks using
   the rules below.

${MARKING_SCHEME_RULES}

Return ONLY a JSON object of this exact shape:
{"questions": [{"text": string, "questionType": "CONCEPTUAL" | "APPLICATION", "marks": number, "markingScheme": string}, ...]}
If the source contains no questions, return {"questions": []}.
`.trim();

  return { system, user };
}

export function buildRevisionQAPrompt(
  input: GenerateRevisionQAInput & { count: number; part: number; totalParts: number },
): { system: string; user: string } {
  const applicationCount = Math.max(1, Math.round(input.count * 0.2));

  const system = [
    "You are an experienced lecturer writing a revision question bank with full model answers.",
    "Questions are open-ended (never multiple-choice). Answers must be accurate and grounded in the source.",
    "Return ONLY strict JSON matching the requested schema. No prose, no markdown fences.",
  ].join(" ");

  const partLine =
    input.totalParts > 1
      ? `This is part ${input.part} of ${input.totalParts} of the student's material; other parts are handled separately, so cover only what is in this part.`
      : "";

  const user = `
UNIT: ${input.unitTitle}
PURPOSE: ${input.purpose}
${partLine}

SOURCE MATERIAL:
${input.sourceText}

TASK:
1. Write exactly ${input.count} revision questions, each with a complete model answer, grounded in the
   SOURCE MATERIAL above.
2. Cover the material systematically from start to finish — every major topic, definition, process,
   comparison and example should be tested by at least one question. Do not cluster on one topic and
   do not repeat the same question in different words.
3. Keep the questions in the order their topics appear in the source.
4. About ${applicationCount} of the questions should be "APPLICATION" (apply a concept to a scenario,
   case, problem or calculation); the rest "CONCEPTUAL" (define, explain, compare, describe). Spread the
   application questions through the set rather than putting them all at the end.
5. Vary the command verbs the way a real exam does ("Define", "Explain", "Differentiate between",
   "Discuss", "Outline", "Describe with examples"…).
6. If the source contains past-paper questions, you may use them as style reference, but write your
   own questions and answers.

${MARKING_SCHEME_RULES}

ANSWER RULES:
- "answer" is the model answer a student would memorise to score full marks. It must contain exactly
  the points the marking scheme counts, each stated and (where the scheme awards it) explained.
- Use Markdown: a short lead sentence where helpful, then a bullet or numbered list with one point per
  item, bold key terms. No headings, no HTML.
- Put every list item on its own line: separate items with a newline ("\n") inside the JSON string,
  e.g. "1. **Point one** - explanation.\n2. **Point two** - explanation." Never run items together
  on one line.
- Use facts, terms and examples from the source. If you must add a widely accepted fact the source
  omits, keep it brief and accurate.

Return ONLY a JSON object of this exact shape:
{"questions": [{"text": string, "questionType": "CONCEPTUAL" | "APPLICATION", "marks": number, "markingScheme": string, "answer": string}, ...]}
The "questions" array must contain exactly ${input.count} items.
`.trim();

  return { system, user };
}

function markingSchemeSection(input: GradeAnswerInput): string {
  if (!input.marks || !input.markingScheme) {
    return "(No marking scheme available for this question — grade holistically from 0-100.)";
  }
  return `This question is worth ${input.marks} marks. Marking scheme: ${input.markingScheme}
Award marksAwarded as a whole number from 0 to ${input.marks} by checking the answer point-by-point
against the marking scheme above — do not award partial marks within a single point (e.g. for a
"1 mark for the point, 1 mark for the explanation" item, award 0, 1, or 2 for that item, never 0.5).
Then set score = round(marksAwarded / ${input.marks} * 100).`;
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

${markingSchemeSection(input)}

Give constructive feedback explaining what was right, what was missing or incorrect (tied to the
marking scheme's points where applicable), and how to improve. Include a concise correct/model answer.

Return ONLY a JSON object of this exact shape:
{"score": number, "marksAwarded": number | null, "feedback": string, "modelAnswer": string}
Set "marksAwarded" to null only if no marking scheme was given above.
`.trim();

  return { system, user };
}

export function buildGradeAnswerBatchPrompt(items: GradeAnswerBatchItem[]): {
  system: string;
  user: string;
} {
  const system = [
    "You are a fair, rigorous grader for open-ended exam/revision answers.",
    "You will grade multiple question/answer pairs in one pass. Judge each against its own source material and marking scheme.",
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
${item.answerText}

${markingSchemeSection(item)}`,
    )
    .join("\n\n");

  const user = `
Grade each of the following ${items.length} question/answer pairs independently, with constructive
feedback and a concise model answer for each. For each item, follow its own marking scheme
instructions above to compute marksAwarded and score (or grade holistically 0-100 with
marksAwarded: null if no marking scheme was given for that item).

${itemsBlock}

Return ONLY a JSON object of this exact shape:
{"results": [{"refId": string, "score": number, "marksAwarded": number | null, "feedback": string, "modelAnswer": string}, ...]}
The "results" array must contain exactly one entry per item above, using the same "refId" values.
`.trim();

  return { system, user };
}

export function buildDiscussAnswerSystemPrompt(input: DiscussAnswerInput): string {
  const { grading } = input;
  const scoreLine =
    grading.marksAwarded != null && input.marks
      ? `${grading.marksAwarded}/${input.marks} marks`
      : `${grading.score}/100`;

  return `
You are a patient, encouraging tutor helping a student understand a revision question they have
just been graded on. The student may ask you to explain a concept further, give examples, clarify
why they lost marks, show how to structure a full-mark answer, or give them more practice.

Guidelines:
- Ground your explanations in the SOURCE MATERIAL below. If you go beyond it, say so briefly.
- Use simple language first, then build up. Concrete, relatable examples help most.
- When asked for "more answers" or other ways to answer, show alternative valid points or
  phrasings that would earn marks under the marking scheme.
- If the student asks for practice, ask one follow-up question at a time and wait for their reply.
- Stay on the topic of this question and its unit. Keep replies focused and reasonably short.
- Format with Markdown (short paragraphs, bullet points, bold key terms) where it helps. Do not
  use HTML tags — they will not display correctly.

SOURCE MATERIAL:
${truncate(input.sourceText, MAX_SOURCE_CHARS)}

QUESTION${input.marks ? ` (${input.marks} marks)` : ""}:
${input.questionText}
${input.markingScheme ? `
MARKING SCHEME: ${input.markingScheme}
` : ""}
STUDENT'S ANSWER:
${input.answerText}

GRADE GIVEN: ${scoreLine}

FEEDBACK GIVEN:
${grading.feedback}
${grading.modelAnswer ? `
MODEL ANSWER:
${grading.modelAnswer}
` : ""}
`.trim();
}
