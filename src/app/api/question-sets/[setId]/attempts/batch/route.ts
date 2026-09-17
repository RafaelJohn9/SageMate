import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";
import { getQuestionSetSourceText } from "@/lib/questionSets";
import { submitBatchAttemptsSchema } from "@/lib/validation/attempts";

type RouteParams = { params: Promise<{ setId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { setId } = await params;

  const questionSet = await db.questionSet.findUnique({
    where: { id: setId },
    include: { questions: true },
  });
  if (!questionSet) {
    return NextResponse.json({ error: "Question set not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = submitBatchAttemptsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const validQuestionIds = new Set(questionSet.questions.map((q) => q.id));
  const answers = parsed.data.answers.filter((a) => validQuestionIds.has(a.questionId));
  if (answers.length === 0) {
    return NextResponse.json({ error: "No valid answers for this question set" }, { status: 400 });
  }

  const questionById = new Map(questionSet.questions.map((q) => [q.id, q]));
  const attempts = await Promise.all(
    answers.map((a) =>
      db.attempt.create({
        data: { questionId: a.questionId, answerText: a.answerText, mode: "BATCH" as const },
      }),
    ),
  );

  try {
    const llm = getLLMProvider();
    const sourceText = await getQuestionSetSourceText(setId);

    const results = await llm.gradeAnswerBatch(
      attempts.map((attempt, i) => ({
        refId: attempt.id,
        questionText: questionById.get(answers[i].questionId)?.text ?? "",
        sourceText,
        answerText: attempt.answerText,
      })),
    );
    const resultByAttemptId = new Map(results.map((r) => [r.refId, r]));

    const gradings = await Promise.all(
      attempts.map(async (attempt) => {
        const result = resultByAttemptId.get(attempt.id);
        if (!result) return null;
        return db.grading.create({
          data: {
            attemptId: attempt.id,
            score: result.score,
            feedback: result.feedback,
            modelAnswer: result.modelAnswer,
            provider: llm.name,
            model: llm.model,
          },
        });
      }),
    );

    const gradingByAttemptId = new Map(gradings.filter((g) => g !== null).map((g) => [g!.attemptId, g]));
    return NextResponse.json(
      {
        attempts: attempts.map((a) => ({ ...a, grading: gradingByAttemptId.get(a.id) ?? null })),
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        attempts: attempts.map((a) => ({ ...a, grading: null })),
        gradingError: `Grading failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 201 },
    );
  }
}
