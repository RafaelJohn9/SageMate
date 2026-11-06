import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DeleteContentButton } from "@/components/content/DeleteContentButton";
import { RenameUnitForm } from "@/components/units/RenameUnitForm";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { summarizeUnit } from "@/lib/unitStats";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    include: {
      content: { orderBy: { createdAt: "desc" } },
      questionSets: {
        orderBy: { createdAt: "desc" },
        include: {
          questions: {
            select: {
              attempts: {
                orderBy: { submittedAt: "desc" },
                take: 1,
                select: { grading: { select: { score: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!unit) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← All units
        </Link>
        <h1 className="font-display tracking-tight text-2xl font-semibold text-foreground">{unit.name}</h1>
        {unit.description && <p className="text-sm text-muted-foreground">{unit.description}</p>}
        <RenameUnitForm unitId={unit.id} initialName={unit.name} initialDescription={unit.description} />
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Content</h2>
          <Link href={`/units/${unit.id}/content/new`} className="text-sm font-medium text-primary hover:underline">
            + Add content
          </Link>
        </div>
        {unit.content.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            Nothing here yet. Add your notes or a past paper to start generating questions.
          </p>
        ) : (
          <ul className="border-t border-border">
            {unit.content.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 border-b border-border py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.contentKind === "PAST_PAPER" ? "Past paper" : "Notes"} for {c.purpose} · added{" "}
                    {formatRelativeTime(c.createdAt)}
                  </p>
                </div>
                <DeleteContentButton contentId={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Question sets</h2>
          <Link
            href={`/units/${unit.id}/question-sets/new`}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Generate questions
          </Link>
        </div>
        {unit.questionSets.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            No question sets yet. Generate one from the content above.
          </p>
        ) : (
          <ul className="border-t border-border">
            {unit.questionSets.map((qs) => {
              const isRevision = qs.kind === "REVISION";
              const progress = summarizeUnit([qs]);
              const failed = qs.status === "FAILED";
              return (
                <li
                  key={qs.id}
                  className="relative flex items-center gap-4 border-b border-border py-3 text-sm transition-colors hover:bg-card/70"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/question-sets/${qs.id}`}
                        className="font-medium text-foreground after:absolute after:inset-0"
                      >
                        {qs.name}
                      </Link>
                      {isRevision && (
                        <span className="rounded-full bg-mark-tint px-2 py-0.5 text-xs text-mark">Revision Q&amp;A</span>
                      )}
                      {qs.status !== "COMPLETED" && (
                        <span className={`text-xs ${failed ? "text-danger" : "text-muted-foreground"}`}>
                          {qs.status === "PENDING" ? "Generating…" : "Generation failed"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {qs.purposeFilter} · {formatRelativeTime(qs.createdAt)}
                      </span>
                      {isRevision ? (
                        <span>{progress.total} questions with answers</span>
                      ) : (
                        progress.total > 0 && (
                          <span className="flex items-center gap-2">
                            <span
                              role="progressbar"
                              aria-label="Questions answered"
                              aria-valuemin={0}
                              aria-valuemax={progress.total}
                              aria-valuenow={progress.answered}
                              className="h-1 w-14 overflow-hidden rounded-full bg-border"
                            >
                              <span
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${(progress.answered / progress.total) * 100}%` }}
                              />
                            </span>
                            {progress.answered} of {progress.total} answered
                          </span>
                        )
                      )}
                    </p>
                  </div>
                  {!isRevision && progress.averageScore !== null && (
                    <ScoreMark
                      size="sm"
                      value={`${progress.averageScore}%`}
                      label={`Average score ${progress.averageScore}%`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
