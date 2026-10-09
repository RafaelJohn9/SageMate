import Groq from "groq-sdk";
import { z } from "zod";
import {
  buildDiscussAnswerSystemPrompt,
  buildExtractQuestionsPrompt,
  buildGenerateQuestionsPrompt,
  buildGradeAnswerBatchPrompt,
  buildGradeAnswerPrompt,
  buildRevisionQAPrompt,
} from "../prompts";
import { planRevisionChunks } from "../revisionPlan";
import type {
  DiscussAnswerInput,
  ExtractQuestionsInput,
  GenerateQuestionsInput,
  GeneratedQuestion,
  GeneratedRevisionQA,
  GenerateRevisionQAInput,
  GradeAnswerBatchItem,
  GradeAnswerBatchResult,
  GradeAnswerInput,
  GradingResult,
  LLMProvider,
} from "../types";

const generatedQuestionSchema = z.object({
  text: z.string().min(1),
  questionType: z.enum(["CONCEPTUAL", "APPLICATION"]),
  marks: z.number().int().min(1),
  markingScheme: z.string().min(1),
});
const generateQuestionsResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});

const revisionQAResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema.extend({ answer: z.string().min(1) })),
});

const gradingResultSchema = z.object({
  score: z.number().min(0).max(100),
  marksAwarded: z.number().int().min(0).nullable().optional(),
  feedback: z.string().min(1),
  modelAnswer: z.string().optional(),
});

const gradeAnswerBatchResultSchema = gradingResultSchema.extend({ refId: z.string() });
const gradeAnswerBatchResponseSchema = z.object({
  results: z.array(gradeAnswerBatchResultSchema),
});

const BATCH_CHUNK_SIZE = 8;

function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  readonly model: string;
  private client: Groq;

  constructor(apiKey: string, model = "openai/gpt-oss-20b") {
    // Extra retries let multi-part revision sets wait out per-minute rate limits (the SDK honours retry-after).
    this.client = new Groq({ apiKey, maxRetries: 5 });
    this.model = model;
  }

  private get supportsReasoningEffort(): boolean {
    return this.model.startsWith("openai/gpt-oss") || this.model.startsWith("qwen/");
  }

  private async completeJson<T>(
    system: string,
    user: string,
    schema: z.ZodType<T>,
    temperature = 0.7,
    { reasoningEffort, maxTokens = 8192 }: { reasoningEffort?: "low"; maxTokens?: number } = {},
  ): Promise<T> {
    const ATTEMPTS = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: attempt === 0 ? temperature : 0.2,
          max_completion_tokens: maxTokens,
          ...(reasoningEffort && this.supportsReasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        });

        const raw = completion.choices[0]?.message?.content ?? "";
        const parsed = JSON.parse(raw);
        return schema.parse(parsed);
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`Groq response did not match expected schema: ${String(lastError)}`);
  }

  async discussAnswer(input: DiscussAnswerInput): Promise<string> {
    const system = buildDiscussAnswerSystemPrompt(input);
    const ATTEMPTS = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: "system", content: system }, ...input.history],
          temperature: 0.5,
          max_completion_tokens: 4096,
        });
        const reply = completion.choices[0]?.message?.content?.trim() ?? "";
        if (reply) return reply;
        lastError = new Error("Empty reply");
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`Groq discussion request failed: ${String(lastError)}`);
  }

  async generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
    const { system, user } = buildGenerateQuestionsPrompt(input);
    const result = await this.completeJson(system, user, generateQuestionsResponseSchema);
    return result.questions;
  }

  async extractQuestions(input: ExtractQuestionsInput): Promise<GeneratedQuestion[]> {
    const { system, user } = buildExtractQuestionsPrompt(input);
    const result = await this.completeJson(system, user, generateQuestionsResponseSchema, 0.1);
    // The model sometimes double-escapes quotes it copies from the source.
    return result.questions.map((q) => ({ ...q, text: q.text.replace(/\\"/g, '"') }));
  }

  async generateRevisionQA(input: GenerateRevisionQAInput): Promise<GeneratedRevisionQA[]> {
    const chunks = planRevisionChunks(input.sourceText);
    const results: GeneratedRevisionQA[][] = [];
    const failures: unknown[] = [];

    // Parts run one at a time: in parallel they just compete for the same per-minute token budget.
    // Low reasoning effort roughly halves the tokens per part without hurting answer quality, and a
    // smaller completion budget keeps each request under Groq's per-request size check (prompt +
    // max_completion_tokens must fit the 8k tokens/min free-tier limit).
    for (const [i, chunk] of chunks.entries()) {
      const { system, user } = buildRevisionQAPrompt({
        ...input,
        sourceText: chunk.text,
        count: chunk.count,
        part: i + 1,
        totalParts: chunks.length,
      });
      try {
        const parsed = await this.completeJson(system, user, revisionQAResponseSchema, 0.5, {
          reasoningEffort: "low",
          maxTokens: 4096,
        });
        results.push(parsed.questions);
      } catch (err) {
        console.error(`Revision Q&A part ${i + 1}/${chunks.length} failed:`, err);
        failures.push(err);
      }
    }

    // One failed part shouldn't sink the whole set, but if every part failed, surface the error.
    if (failures.length === chunks.length && chunks.length > 0) {
      throw failures[0] instanceof Error ? failures[0] : new Error(String(failures[0]));
    }

    const seen = new Set<string>();
    return results.flat().filter((q) => {
      const key = normalizeQuestion(q.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async gradeAnswer(input: GradeAnswerInput): Promise<GradingResult> {
    const { system, user } = buildGradeAnswerPrompt(input);
    return this.completeJson(system, user, gradingResultSchema);
  }

  async gradeAnswerBatch(items: GradeAnswerBatchItem[]): Promise<GradeAnswerBatchResult[]> {
    if (items.length === 0) return [];

    const chunks: GradeAnswerBatchItem[][] = [];
    for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
      chunks.push(items.slice(i, i + BATCH_CHUNK_SIZE));
    }

    const results: GradeAnswerBatchResult[] = [];
    for (const chunk of chunks) {
      const { system, user } = buildGradeAnswerBatchPrompt(chunk);
      let chunkResults: GradeAnswerBatchResult[] = [];
      try {
        const parsed = await this.completeJson(system, user, gradeAnswerBatchResponseSchema);
        chunkResults = parsed.results;
      } catch {
        chunkResults = [];
      }

      const byRefId = new Map(chunkResults.map((r) => [r.refId, r]));
      for (const item of chunk) {
        const match = byRefId.get(item.refId);
        if (match) {
          results.push(match);
        } else {
          const fallback = await this.gradeAnswer(item);
          results.push({ ...fallback, refId: item.refId });
        }
      }
    }

    return results;
  }
}
