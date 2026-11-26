import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";
import { getQuestionSourceText } from "@/lib/questionSets";
import { recordReview } from "@/lib/review";
import { resultFromScore } from "@/lib/spacedRepetition";

type GradableQuestion = {
  id: string;
  text: string;
  questionSetId: string;
  stepId?: string | null;
  marks: number | null;
  markingScheme: string | null;
};

/**
 * Grades a saved attempt with the LLM, stores the grading, and moves the question along its review
 * schedule. Throws if the LLM call fails; the attempt itself is already saved by then.
 */
export async function gradeAttempt(
  question: GradableQuestion,
  attempt: { id: string; answerText: string; submittedAt: Date },
) {
  const llm = getLLMProvider();
  const sourceText = await getQuestionSourceText(question);
  const result = await llm.gradeAnswer({
    questionText: question.text,
    sourceText,
    answerText: attempt.answerText,
    marks: question.marks ?? undefined,
    markingScheme: question.markingScheme ?? undefined,
  });
  const grading = await db.grading.create({
    data: {
      attemptId: attempt.id,
      score: result.score,
      marksAwarded: result.marksAwarded ?? null,
      feedback: result.feedback,
      modelAnswer: result.modelAnswer,
      provider: llm.name,
      model: llm.model,
    },
  });
  await recordReview(question.id, resultFromScore(result.score), attempt.submittedAt);
  return grading;
}
