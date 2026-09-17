import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AnsweringPanel } from "@/components/question-sets/AnsweringPanel";

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
    latestAttempt: q.attempts[0]
      ? {
          answerText: q.attempts[0].answerText,
          grading: q.attempts[0].grading,
        }
      : null,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href={`/units/${questionSet.unitId}`} className="text-sm text-zinc-500 hover:underline">
          ← {questionSet.unit.name}
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{questionSet.name}</h1>
        <p className="text-xs text-zinc-400">
          {questionSet.status} · purpose: {questionSet.purposeFilter} · {questionSet.provider}/{questionSet.model}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <a
            href={`/api/question-sets/${questionSet.id}/export`}
            className="text-zinc-500 hover:underline"
          >
            Export: questions only (PDF)
          </a>
          <a
            href={`/api/question-sets/${questionSet.id}/export?withAnswers=true`}
            className="text-zinc-500 hover:underline"
          >
            Export: questions + your answers (PDF)
          </a>
          <a
            href={`/api/question-sets/${questionSet.id}/export?withAnswers=true&withCorrections=true`}
            className="text-zinc-500 hover:underline"
          >
            Export: questions + answers + corrections (PDF)
          </a>
        </div>
      </header>

      <AnsweringPanel setId={questionSet.id} questions={questionsWithLatest} />
    </div>
  );
}
