import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gradeAttempt } from "@/lib/grading";
import { submitAttemptSchema } from "@/lib/validation/attempts";

type RouteParams = { params: Promise<{ itemId: string }> };

// Answers one question of a morning session: saves the attempt, grades it (which also moves the
// question along its review schedule), and ticks the item off.
export async function POST(request: Request, { params }: RouteParams) {
  const { itemId } = await params;
  const item = await db.reviewSessionItem.findUnique({ where: { id: itemId }, include: { question: true } });
  if (!item) return NextResponse.json({ error: "That question is no longer in today's session" }, { status: 404 });
  if (item.attemptId) return NextResponse.json({ error: "You have already answered this one" }, { status: 409 });

  const parsed = submitAttemptSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = await db.attempt.create({
    data: { questionId: item.questionId, answerText: parsed.data.answerText, mode: "IMMEDIATE" },
  });

  try {
    const grading = await gradeAttempt(item.question, attempt);
    await db.reviewSessionItem.update({ where: { id: itemId }, data: { attemptId: attempt.id } });
    const schedule = await db.question.findUnique({
      where: { id: item.questionId },
      select: { box: true, dueAt: true },
    });
    return NextResponse.json({ attempt: { ...attempt, grading }, schedule }, { status: 201 });
  } catch (err) {
    // The item stays open, so the student can submit again once grading works.
    return NextResponse.json(
      { attempt, gradingError: `Grading failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 201 },
    );
  }
}
