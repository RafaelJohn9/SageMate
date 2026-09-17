import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/factory";
import { getQuestionSetSourceText } from "@/lib/questionSets";
import { submitAttemptSchema } from "@/lib/validation/attempts";

type RouteParams = { params: Promise<{ questionId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { questionId } = await params;
  const attempts = await db.attempt.findMany({
    where: { questionId },
    orderBy: { submittedAt: "desc" },
    include: { grading: true },
  });
  return NextResponse.json({ attempts });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { questionId } = await params;

  const question = await db.question.findUnique({ where: { id: questionId } });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = submitAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = await db.attempt.create({
    data: { questionId, answerText: parsed.data.answerText, mode: "IMMEDIATE" },
  });

  try {
    const llm = getLLMProvider();
    const sourceText = await getQuestionSetSourceText(question.questionSetId);
    const result = await llm.gradeAnswer({
      questionText: question.text,
      sourceText,
      answerText: parsed.data.answerText,
    });
    const grading = await db.grading.create({
      data: {
        attemptId: attempt.id,
        score: result.score,
        feedback: result.feedback,
        modelAnswer: result.modelAnswer,
        provider: llm.name,
        model: llm.model,
      },
    });
    return NextResponse.json({ attempt: { ...attempt, grading } }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        attempt,
        gradingError: `Grading failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 201 },
    );
  }
}
