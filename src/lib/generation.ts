import { db } from "@/lib/db";
import type { GeneratedQuestion, LLMProvider } from "@/lib/llm/types";

export type GenerationJob = {
  questionSetId: string;
  mode: "generate" | "extract" | "revision";
  unitTitle: string;
  purpose: string;
  count: number;
  notesText: string;
  pastPaperText?: string;
  allSourceText: string;
  priorQuestions: string[];
};

// Runs the LLM call for a question set that already exists as PENDING, saves the questions, and
// records the outcome on the set. Never throws: it runs after the HTTP response has been sent, so
// any failure has to land on the set (status + error) where the UI can show it.
export async function runGeneration(llm: LLMProvider, job: GenerationJob): Promise<void> {
  try {
    const generated: (GeneratedQuestion & { answer?: string })[] =
      job.mode === "extract"
        ? await llm.extractQuestions({ unitTitle: job.unitTitle, sourceText: job.allSourceText })
        : job.mode === "revision"
          ? await llm.generateRevisionQA({
              unitTitle: job.unitTitle,
              purpose: job.purpose,
              sourceText: job.allSourceText,
            })
          : await llm.generateQuestions({
              unitTitle: job.unitTitle,
              purpose: job.purpose,
              notesText:
                job.notesText || "(no notes provided — rely on past paper style and general unit context)",
              pastPaperText: job.pastPaperText,
              priorQuestions: job.priorQuestions,
              count: job.count,
            });

    if (generated.length === 0) {
      throw new Error(
        job.mode === "extract" ? "No questions were found in the selected content" : "LLM returned no questions",
      );
    }

    await db.$transaction([
      db.question.createMany({
        data: generated.map((q, index) => ({
          questionSetId: job.questionSetId,
          text: q.text,
          orderIndex: index,
          questionType: q.questionType,
          marks: q.marks,
          markingScheme: q.markingScheme,
          answer: q.answer ?? null,
        })),
      }),
      db.questionSet.update({
        where: { id: job.questionSetId },
        data: { status: "COMPLETED", error: null },
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Question set ${job.questionSetId} failed:`, err);
    try {
      await db.questionSet.update({
        where: { id: job.questionSetId },
        data: { status: "FAILED", error: message },
      });
    } catch (updateErr) {
      console.error(`Could not record failure for question set ${job.questionSetId}:`, updateErr);
    }
  }
}
