import Link from "next/link";
import { db } from "@/lib/db";
import { MorningSession, type MorningItem } from "@/components/morning/MorningSession";
import { TrackReading } from "@/components/morning/TrackReading";
import { countStreak } from "@/lib/morning";
import { getReviewSettings } from "@/lib/morningSession";
import { effectiveStatus, INTERRUPTED_MESSAGE } from "@/lib/questionSetStatus";
import { addDays, dayToDate, daysBetween, readingForToday, readingMinutes, toDay, trackPhase } from "@/lib/studyPlan";

// Everything here depends on today's date and the database, so it is rendered on every request.
export const dynamic = "force-dynamic";

const INTERRUPTED = INTERRUPTED_MESSAGE.replace("creating the set", "getting your questions");

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export default async function MorningPage() {
  const now = new Date();
  const today = toDay(now);

  const [settings, tracks, session, answeredSessions] = await Promise.all([
    getReviewSettings(),
    db.studyTrack.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        unit: { select: { id: true, name: true } },
        sources: { select: { contentId: true } },
        steps: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            title: true,
            start: true,
            end: true,
            readOn: true,
            briefing: true,
            content: { select: { title: true } },
          },
        },
      },
    }),
    db.reviewSession.findUnique({
      where: { day: today },
      include: {
        items: {
          orderBy: { orderIndex: "asc" },
          include: {
            question: {
              select: {
                text: true,
                questionType: true,
                marks: true,
                markingScheme: true,
                dueAt: true,
                questionSet: { select: { unit: { select: { name: true } } } },
                step: { select: { title: true } },
              },
            },
            attempt: { select: { grading: true } },
          },
        },
      },
    }),
    db.reviewSession.findMany({
      where: { items: { some: { attemptId: { not: null } } } },
      orderBy: { day: "desc" },
      take: 400,
      select: { day: true },
    }),
  ]);

  const active = tracks.filter((t) => !t.paused && trackPhase(t, today) === "active");
  const upcoming = tracks.filter((t) => !t.paused && trackPhase(t, today) === "upcoming");
  const readSomething = active.some((t) => t.steps.some((s) => s.readOn));
  const streak = countStreak(
    answeredSessions.map((s) => s.day),
    today,
    (day) => addDays(day, -1),
  );

  const status = session ? effectiveStatus(session.status, session.startedAt, now) : "NONE";
  const items: MorningItem[] = (session?.items ?? []).map((item) => ({
    id: item.id,
    reason: item.reason,
    unitName: item.question.questionSet.unit.name,
    stepTitle: item.question.step?.title ?? null,
    question: {
      text: item.question.text,
      questionType: item.question.questionType,
      marks: item.question.marks,
      markingScheme: item.question.markingScheme,
    },
    result: item.attempt?.grading
      ? { grading: item.attempt.grading, dueDay: item.question.dueAt ? toDay(item.question.dueAt) : null }
      : null,
  }));

  const emptyHint =
    active.length === 0
      ? null
      : !readSomething
        ? "Nothing to ask yet. Tick what you have already read under Reading below, then come back for your questions."
        : session && status === "COMPLETED" && items.length === 0
          ? "No questions could be found for today. Tick more of what you have read below, then check again."
          : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Morning repetition</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {streak > 1
              ? `${streak} mornings in a row.`
              : "A few questions from memory each morning, so what you read stays with you."}{" "}
            <Link href="/morning/plan" className="font-medium text-primary hover:underline">
              Change the plan
            </Link>
          </p>
        </div>
        {/* The date, written in the corner of the page the way it heads a day's work in an exercise book. */}
        <p className="font-hand text-3xl leading-none text-primary" style={{ transform: "rotate(-2deg)" }}>
          {longDate.format(now)}
        </p>
      </header>

      {tracks.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-l-2 border-mark/35 pl-5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Set up your plan first</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Choose the units to keep fresh, the notes to work through in each, how far you want to get, and by
            when. Each morning you then get questions drawn from what you have read so far.
          </p>
          <Link
            href="/morning/plan"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Set up the plan
          </Link>
        </div>
      ) : active.length === 0 ? (
        <p className="border-y border-border py-5 text-sm text-muted-foreground">
          No unit in your plan is running today.{" "}
          {upcoming.length > 0
            ? `${upcoming[0].unit.name} starts on ${shortDate.format(dayToDate(upcoming[0].startDate))}.`
            : "Their end dates have passed or they are paused."}{" "}
          <Link href="/morning/plan" className="font-medium text-primary hover:underline">
            Change the dates
          </Link>
        </p>
      ) : (
        <>
          <section aria-label="This morning's questions">
            <MorningSession
              status={status}
              error={session?.status === "FAILED" ? session.error : status === "FAILED" ? INTERRUPTED : null}
              items={items}
              dailyQuestions={settings.dailyQuestions}
              today={today}
              emptyHint={emptyHint}
            />
            {active.length < settings.minUnits && (
              <p className="mt-4 text-xs text-muted-foreground">
                Your plan mixes at least {settings.minUnits} units each morning, but only {active.length}{" "}
                {active.length === 1 ? "is" : "are"} running today.{" "}
                <Link href="/morning/plan" className="text-foreground underline underline-offset-2 hover:no-underline">
                  Add another unit
                </Link>
              </p>
            )}
          </section>

          <section className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Reading</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              What is left of each unit, shared out over the days you have. Fall behind and the daily share
              grows a little; read ahead and it shrinks.
            </p>
            <ul className="mt-2 border-t border-border">
              {active.map((track) => {
                const plan = readingForToday(
                  track.steps.map((s) => ({ id: s.id, chars: s.end - s.start, readOn: s.readOn })),
                  today,
                  track.endDate,
                );
                const manySources = track.sources.length > 1;
                return (
                  <TrackReading
                    key={track.id}
                    unitId={track.unit.id}
                    unitName={track.unit.name}
                    todayIds={plan.today}
                    dailyMinutes={readingMinutes(plan.dailyChars)}
                    daysLeft={daysBetween(today, track.endDate) + 1}
                    steps={track.steps.map((s) => ({
                      id: s.id,
                      title: s.title,
                      source: manySources ? s.content.title : null,
                      minutes: readingMinutes(s.end - s.start),
                      read: s.readOn !== null,
                      briefing: s.briefing,
                    }))}
                  />
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

