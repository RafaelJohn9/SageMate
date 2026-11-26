"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DiscussionPanel } from "@/components/question-sets/DiscussionPanel";
import { buttonPrimary, buttonSecondary } from "@/components/ui/form";
import { Markdown } from "@/components/ui/Markdown";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { PASS_THRESHOLD } from "@/lib/spacedRepetition";
import { daysBetween, toDay } from "@/lib/studyPlan";

type Grading = {
  id: string;
  score: number;
  marksAwarded?: number | null;
  feedback: string;
  modelAnswer?: string | null;
};

type Result = { grading: Grading; dueDay: string | null };

export type MorningItem = {
  id: string;
  reason: string;
  unitName: string;
  stepTitle: string | null;
  question: {
    text: string;
    questionType: "CONCEPTUAL" | "APPLICATION";
    marks: number | null;
    markingScheme: string | null;
  };
  result: Result | null;
};

const POLL_MS = 3000;

const REASON_LABEL: Record<string, string> = {
  due: "Due for review",
  new: "First time asked",
  early: "Ahead of schedule",
};

function markText(grading: Grading, marks: number | null): string {
  if (grading.marksAwarded != null && marks != null) return `${grading.marksAwarded}/${marks}`;
  return `${Math.round(grading.score)}%`;
}

function comesBack(dueDay: string | null, today: string): string {
  if (!dueDay) return "";
  const days = daysBetween(today, dueDay);
  if (days <= 1) return "Comes back tomorrow.";
  return `Comes back in ${days} days.`;
}

export function MorningSession({
  status,
  error,
  items,
  dailyQuestions,
  today,
  emptyHint,
}: {
  status: "NONE" | "PENDING" | "FAILED" | "COMPLETED";
  error: string | null;
  items: MorningItem[];
  dailyQuestions: number;
  today: string;
  /** Why there is nothing to ask, when that is the case. */
  emptyHint: string | null;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Record<string, Result>>({});
  const [gradingErrors, setGradingErrors] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [pasteBlocked, setPasteBlocked] = useState(false);

  // Re-run the server component until the session is ready. Skipped while the tab is hidden.
  useEffect(() => {
    if (status !== "PENDING") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, router]);

  async function start(more: boolean) {
    setStarting(true);
    setStartError(null);
    const res = await fetch("/api/review/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ more }),
    });
    setStarting(false);
    if (!res.ok) {
      setStartError("Could not start the session. Try again.");
      return;
    }
    setChosenId(null);
    router.refresh();
  }

  const resultOf = (item: MorningItem) => fresh[item.id] ?? item.result;
  const answered = items.filter((item) => resultOf(item)).length;
  const firstOpen = items.find((item) => !resultOf(item));
  const current = items.find((item) => item.id === chosenId) ?? firstOpen ?? items.at(-1);

  async function submit(item: MorningItem) {
    const answerText = (answers[item.id] ?? "").trim();
    if (!answerText) {
      setGradingErrors((prev) => ({ ...prev, [item.id]: "Write an answer first." }));
      return;
    }
    setSubmittingId(item.id);
    setGradingErrors((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    const res = await fetch(`/api/review/items/${item.id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerText }),
    });
    setSubmittingId(null);
    const body = await res.json().catch(() => null);

    if (res.ok && body?.attempt?.grading) {
      const dueAt = body.schedule?.dueAt;
      setFresh((prev) => ({
        ...prev,
        [item.id]: { grading: body.attempt.grading, dueDay: dueAt ? toDay(new Date(dueAt)) : null },
      }));
      // Stay on this question so the marking can be read; "Next question" moves on.
      setChosenId(item.id);
      router.refresh();
      return;
    }
    const message =
      body?.gradingError ?? (typeof body?.error === "string" ? body.error : "Could not save your answer. Try again.");
    setGradingErrors((prev) => ({ ...prev, [item.id]: message }));
  }

  if (status === "PENDING" || starting) {
    return (
      <div role="status" className="flex flex-col gap-3 border-l-2 border-mark/35 pl-5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          Choosing this morning&rsquo;s questions
        </h2>
        <div className="writing-bar h-2 w-full max-w-xs overflow-hidden rounded-full bg-border" aria-hidden>
          <span className="block h-full w-1/3 rounded-full bg-highlight" />
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Questions on what you read most recently are written fresh, so this can take up to a minute.
        </p>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div role="alert" className="flex flex-col gap-3 border-l-2 border-danger pl-5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          This morning&rsquo;s questions could not be prepared
        </h2>
        {error && <p className="max-w-xl text-sm text-muted-foreground">{error}</p>}
        <div>
          <button type="button" onClick={() => start(false)} className={buttonPrimary}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0 || !current) {
    return (
      <div className="flex flex-col items-start gap-3 border-l-2 border-mark/35 pl-5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          {dailyQuestions} question{dailyQuestions === 1 ? "" : "s"} from memory
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          {emptyHint ??
            "A mix of what you read lately and what is due to come back, drawn from across your units. Type each answer without looking; it is marked straight away."}
        </p>
        {(status === "NONE" || !emptyHint) && (
          <button type="button" onClick={() => start(false)} className={buttonPrimary}>
            Get this morning&rsquo;s questions
          </button>
        )}
        {status === "COMPLETED" && emptyHint && (
          <button type="button" onClick={() => start(false)} className={buttonSecondary}>
            Check again
          </button>
        )}
        {startError && <p className="text-sm text-danger">{startError}</p>}
      </div>
    );
  }

  const result = resultOf(current);
  const index = items.indexOf(current);
  const next = items.slice(index + 1).find((item) => !resultOf(item)) ?? items.find((item) => !resultOf(item));
  const allDone = answered === items.length;
  const passed = items.filter((item) => (resultOf(item)?.grading.score ?? 0) >= PASS_THRESHOLD).length;

  return (
    <div className="flex flex-col gap-5">
      {/* The morning's register: one box per question, ticked or crossed in red pen as it is marked. */}
      <ol className="flex flex-wrap items-center gap-2" aria-label="Today's questions">
        {items.map((item, i) => {
          const itemResult = resultOf(item);
          const isCurrent = item.id === current.id;
          const pass = itemResult && itemResult.grading.score >= PASS_THRESHOLD;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setChosenId(item.id)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Question ${i + 1}${itemResult ? (pass ? ", passed" : ", to come back tomorrow") : ", not answered"}`}
                className={`relative flex size-10 items-center justify-center rounded-md border text-sm ${
                  isCurrent
                    ? "border-primary bg-highlight font-semibold text-highlight-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {itemResult ? (
                  <span aria-hidden className="font-hand text-3xl leading-none text-mark">
                    {pass ? "✓" : "✗"}
                  </span>
                ) : (
                  i + 1
                )}
              </button>
            </li>
          );
        })}
        <li className="ml-1 text-sm text-muted-foreground">
          {answered} of {items.length} answered
        </li>
      </ol>

      <article className="border-l-2 border-mark/35 pl-5">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{current.unitName}</span>
          {current.stepTitle ? `, ${current.stepTitle}` : ""}
        </p>
        <h2 className="mt-2 max-w-2xl font-display text-xl font-semibold leading-snug tracking-tight text-foreground">
          {current.question.text}
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {REASON_LABEL[current.reason] ?? "Review"}
          {current.question.marks != null &&
            `, ${current.question.marks} mark${current.question.marks === 1 ? "" : "s"}`}
          {current.question.questionType === "APPLICATION" && ", application"}
        </p>

        {!result ? (
          <div className="mt-4 flex flex-col gap-2">
            <label htmlFor={`answer-${current.id}`} className="sr-only">
              Your answer
            </label>
            <textarea
              id={`answer-${current.id}`}
              key={current.id}
              value={answers[current.id] ?? ""}
              onChange={(e) => {
                setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }));
                setPasteBlocked(false);
              }}
              onPaste={(e) => {
                e.preventDefault();
                setPasteBlocked(true);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setPasteBlocked(true);
              }}
              placeholder="Answer from memory, without your notes…"
              rows={6}
              className="w-full max-w-2xl rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
            {pasteBlocked && (
              <p className="text-xs text-muted-foreground">
                Pasting is turned off: recalling the answer yourself is what makes it stick.
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => submit(current)}
                disabled={submittingId !== null}
                className={buttonPrimary}
              >
                {submittingId === current.id ? "Marking…" : "Mark my answer"}
              </button>
              {gradingErrors[current.id] && <p className="text-sm text-danger">{gradingErrors[current.id]}</p>}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex max-w-2xl flex-col gap-3 text-sm sm:flex-row sm:gap-5">
            <div className="sm:pt-1">
              <ScoreMark value={markText(result.grading, current.question.marks)} />
            </div>
            <div className="min-w-0 flex-1">
              <Markdown>{result.grading.feedback}</Markdown>
              {result.grading.modelAnswer && (
                <div className="mt-3 border-l-2 border-primary pl-3 text-muted-foreground">
                  <span className="font-medium text-foreground">Model answer: </span>
                  <Markdown>{result.grading.modelAnswer}</Markdown>
                </div>
              )}
              <p className="mt-3 text-muted-foreground">
                {result.grading.score >= PASS_THRESHOLD ? (
                  <>Passed. {comesBack(result.dueDay, today)}</>
                ) : (
                  <>
                    Not there yet. {comesBack(result.dueDay, today)}
                    {current.stepTitle && (
                      <>
                        {" "}
                        Worth re-reading <span className="text-foreground">{current.stepTitle}</span> before then.
                      </>
                    )}
                  </>
                )}
              </p>
              <DiscussionPanel key={result.grading.id} gradingId={result.grading.id} />
              {next && (
                <button type="button" onClick={() => setChosenId(next.id)} className={`${buttonPrimary} mt-4`}>
                  Next question
                </button>
              )}
            </div>
          </div>
        )}
      </article>

      {allDone && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
          <p className="text-sm text-foreground">
            Done for this morning: {passed} of {items.length} passed.
          </p>
          <button type="button" onClick={() => start(true)} className={buttonSecondary}>
            Do {dailyQuestions} more
          </button>
          {startError && <p className="text-sm text-danger">{startError}</p>}
        </div>
      )}
    </div>
  );
}
