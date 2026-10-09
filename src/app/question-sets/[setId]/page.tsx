import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AnsweringPanel } from "@/components/question-sets/AnsweringPanel";
import { RevisionPanel } from "@/components/question-sets/RevisionPanel";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

export default async function QuestionSetDetailPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
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
    notFound();
  }

  const questionsWithLatest = questionSet.questions.map((q) => ({
    id: q.id,
    orderIndex: q.orderIndex,
    text: q.text,
    questionType: q.questionType,
    marks: q.marks,
    markingScheme: q.markingScheme,
    answer: q.answer,
    latestAttempt: q.attempts[0]
      ? {
          answerText: q.attempts[0].answerText,
          grading: q.attempts[0].grading,
        }
      : null,
  }));

  const isRevision = questionSet.kind === "REVISION";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href={`/units/${questionSet.unitId}`} className="text-sm text-muted-foreground hover:underline">
          ← {questionSet.unit.name}
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-foreground">{questionSet.name}</h1>
        <p className="text-xs text-muted-foreground">
          {isRevision ? `Revision set of ${questionSet.questions.length} · ` : ""}Generated {formatRelativeTime(questionSet.createdAt)} · {questionSet.status.toLowerCase()} · purpose:{" "}
          {questionSet.purposeFilter} · {questionSet.provider}/{questionSet.model}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {isRevision && (
            <a
              href={`/api/question-sets/${questionSet.id}/export?withModelAnswers=true`}
              className="text-primary hover:underline"
            >
              Export: questions + model answers (PDF)
            </a>
          )}
          <a
            href={`/api/question-sets/${questionSet.id}/export`}
            className="text-primary hover:underline"
          >
            Export: questions only (PDF)
          </a>
          <a
            href={`/api/question-sets/${questionSet.id}/export?withAnswers=true`}
            className="text-primary hover:underline"
          >
            Export: questions + your answers (PDF)
          </a>
          <a
            href={`/api/question-sets/${questionSet.id}/export?withAnswers=true&withCorrections=true`}
            className="text-primary hover:underline"
          >
            Export: questions + answers + corrections (PDF)
          </a>
        </div>
      </header>

      {isRevision ? (
        <RevisionPanel setId={questionSet.id} questions={questionsWithLatest} />
      ) : (
        <AnsweringPanel setId={questionSet.id} questions={questionsWithLatest} />
      )}
    </div>
  );
}
