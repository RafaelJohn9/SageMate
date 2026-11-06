import Link from "next/link";
import { db } from "@/lib/db";
import { CreateUnitForm } from "@/components/units/CreateUnitForm";
import { DeleteUnitButton } from "@/components/units/DeleteUnitButton";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { summarizeUnit } from "@/lib/unitStats";

export default async function Home() {
  const [units, lastAttempt] = await Promise.all([
    db.unit.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { content: true, questionSets: true } },
        questionSets: {
          where: { kind: "PRACTICE" },
          select: {
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
    }),
    db.attempt.findFirst({
      orderBy: { submittedAt: "desc" },
      select: {
        submittedAt: true,
        question: {
          select: { questionSet: { select: { id: true, name: true, unit: { select: { name: true } } } } },
        },
      },
    }),
  ]);

  const resume = lastAttempt && {
    href: `/question-sets/${lastAttempt.question.questionSet.id}`,
    setName: lastAttempt.question.questionSet.name,
    unitName: lastAttempt.question.questionSet.unit.name,
    when: formatRelativeTime(lastAttempt.submittedAt),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Your units</h1>
        {resume ? (
          <p className="text-sm text-muted-foreground">
            You last practised{" "}
            <Link href={resume.href} className="font-medium text-foreground underline decoration-highlight decoration-4 underline-offset-2 hover:decoration-primary">
              {resume.setName}
            </Link>{" "}
            in {resume.unitName}, {resume.when}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add your notes to a unit, generate questions from them, and mark your own answers.
          </p>
        )}
      </header>

      <section aria-label="Units">
        {units.length === 0 ? (
          <p className="border-y border-border py-6 text-sm text-muted-foreground">
            No units yet. Create one below, then add your notes to it.
          </p>
        ) : (
          // The red rule down the left is the margin line; each row sits on a ruled line.
          <ul className="border-l-2 border-mark/35 pl-5">
            {units.map((unit) => {
              const progress = summarizeUnit(unit.questionSets);
              const { content, questionSets } = unit._count;
              return (
                <li
                  key={unit.id}
                  className="group relative -ml-5 border-b border-border py-4 pl-5 transition-colors first:border-t hover:bg-card/70"
                >
                  <div className="flex items-end gap-3">
                    <Link
                      href={`/units/${unit.id}`}
                      className="font-display text-xl font-semibold tracking-tight text-foreground after:absolute after:inset-0"
                    >
                      {unit.name}
                    </Link>
                    <span aria-hidden className="mb-1.5 min-w-6 flex-1 border-b-2 border-dotted border-border" />
                    {progress.averageScore !== null ? (
                      <ScoreMark
                        size="sm"
                        value={`${progress.averageScore}%`}
                        label={`Average score ${progress.averageScore}%`}
                      />
                    ) : (
                      <span className="mb-0.5 text-xs text-muted-foreground">Not graded yet</span>
                    )}
                  </div>

                  {unit.description && <p className="mt-0.5 text-sm text-muted-foreground">{unit.description}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {content} content item{content === 1 ? "" : "s"}
                    </span>
                    <span>
                      {questionSets} question set{questionSets === 1 ? "" : "s"}
                    </span>
                    {progress.total > 0 && (
                      <span className="flex items-center gap-2">
                        <span
                          role="progressbar"
                          aria-label="Questions answered"
                          aria-valuemin={0}
                          aria-valuemax={progress.total}
                          aria-valuenow={progress.answered}
                          className="h-1 w-16 overflow-hidden rounded-full bg-border"
                        >
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${(progress.answered / progress.total) * 100}%` }}
                          />
                        </span>
                        {progress.answered} of {progress.total} answered
                      </span>
                    )}
                    <span className="relative z-10 ml-auto opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <DeleteUnitButton unitId={unit.id} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details open={units.length === 0} className="group/new">
        <summary className="w-fit cursor-pointer rounded-md text-sm font-medium text-primary marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="group-open/new:hidden">+ New unit</span>
          <span className="hidden group-open/new:inline">Close</span>
        </summary>
        <div className="mt-3">
          <CreateUnitForm />
        </div>
      </details>
    </div>
  );
}
