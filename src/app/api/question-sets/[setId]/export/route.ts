import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderQuestionSetPdf } from "@/lib/pdf/render";
import { sanitizeForPdf } from "@/lib/pdf/sanitize";

type RouteParams = { params: Promise<{ setId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { setId } = await params;
  const url = new URL(request.url);
  const withAnswers = url.searchParams.get("withAnswers") === "true";
  const withCorrections = url.searchParams.get("withCorrections") === "true";

  const questionSet = await db.questionSet.findUnique({
    where: { id: setId },
    include: {
      unit: true,
      questions: {
        orderBy: { orderIndex: "asc" },
        include: {
          attempts: {
            orderBy: { submittedAt: "desc" },
            take: 1,
            include: { grading: true },
          },
        },
      },
    },
  });
  if (!questionSet) {
    return NextResponse.json({ error: "Question set not found" }, { status: 404 });
  }

  const pdfQuestions = questionSet.questions.map((q) => {
    const latest = q.attempts[0];
    return {
      orderIndex: q.orderIndex,
      text: sanitizeForPdf(q.text),
      questionType: q.questionType,
      answerText: latest ? sanitizeForPdf(latest.answerText) : null,
      grading: latest?.grading
        ? {
            score: latest.grading.score,
            feedback: sanitizeForPdf(latest.grading.feedback),
            modelAnswer: latest.grading.modelAnswer ? sanitizeForPdf(latest.grading.modelAnswer) : null,
          }
        : null,
    };
  });

  const buffer = await renderQuestionSetPdf({
    setName: questionSet.name,
    unitName: questionSet.unit.name,
    questions: pdfQuestions,
    withAnswers,
    withCorrections: withCorrections && withAnswers,
  });

  const safeName = questionSet.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "question-set";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
    },
  });
}
