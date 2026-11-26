import { db } from "@/lib/db";
import type { LLMProvider } from "@/lib/llm/types";
import { composeSession, type UnitCandidates } from "@/lib/morning";
import { toDay, trackPhase } from "@/lib/studyPlan";

// Putting a morning's session together: topping up each unit's supply of never-asked questions from
// what has been read, then choosing the day's questions. The choosing itself is in src/lib/morning.ts.

/** Keep at least this many never-asked questions ready per unit. */
const FRESH_BUFFER = 2;
/** Questions written per LLM call, and the most a single step will ever get. */
const QUESTIONS_PER_CALL = 3;
const MAX_QUESTIONS_PER_STEP = 6;
/** LLM calls per preparation run, so a morning never waits on more than a few. */
const MAX_GENERATIONS = 3;

export async function getReviewSettings() {
  return db.reviewSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export async function getActiveTracks(today: string) {
  const tracks = await db.studyTrack.findMany({
    where: { paused: false },
    include: { unit: { select: { id: true, name: true } }, sources: { select: { contentId: true } } },
    orderBy: { createdAt: "asc" },
  });
  return tracks.filter((t) => trackPhase(t, today) === "active");
}

type ActiveTrack = Awaited<ReturnType<typeof getActiveTracks>>[number];

/**
 * A track's questions, sorted into what is due, what has never been asked, and what is not due yet.
 * Besides the track's own bank this takes in practice questions the student has already answered from
 * the same documents: those are on the review schedule too.
 */
export async function loadCandidates(track: ActiveTrack, now: Date, exclude: string[]): Promise<UnitCandidates> {
  const questions = await db.question.findMany({
    where: {
      id: { notIn: exclude },
      OR: [
        { questionSetId: track.bankSetId },
        {
          dueAt: { not: null },
          questionSet: {
            unitId: track.unitId,
            sourceContent: { some: { contentId: { in: track.sources.map((s) => s.contentId) } } },
          },
        },
      ],
    },
    select: {
      id: true,
      box: true,
      dueAt: true,
      lastResult: true,
      createdAt: true,
      step: { select: { readOn: true, orderIndex: true } },
    },
  });

  const time = (d: Date | null) => d?.getTime() ?? 0;
  const due = questions
    .filter((q) => q.dueAt && q.dueAt <= now)
    // Most at risk first: last answer failed, then the lowest box, then the longest overdue.
    .sort(
      (a, b) =>
        Number(b.lastResult === "FAIL") - Number(a.lastResult === "FAIL") ||
        a.box - b.box ||
        time(a.dueAt) - time(b.dueAt),
    );
  const early = questions.filter((q) => q.dueAt && q.dueAt > now).sort((a, b) => time(a.dueAt) - time(b.dueAt));
  const fresh = questions
    .filter((q) => !q.dueAt)
    // Most recently read first: the first recall should come soon after the reading.
    .sort(
      (a, b) =>
        (b.step?.readOn ?? "").localeCompare(a.step?.readOn ?? "") ||
        (a.step?.orderIndex ?? 0) - (b.step?.orderIndex ?? 0) ||
        time(a.createdAt) - time(b.createdAt),
    );

  return { unitId: track.unitId, due: due.map((q) => q.id), fresh: fresh.map((q) => q.id), early: early.map((q) => q.id) };
}

/**
 * Writes questions for one read step of the track: the one with the fewest questions so far, most
 * recently read first. Returns how many were added (0 when every read step already has enough).
 */
export async function writeQuestionsForTrack(llm: LLMProvider, track: ActiveTrack): Promise<number> {
  const steps = await db.studyStep.findMany({
    where: { trackId: track.id, readOn: { not: null } },
    include: {
      content: { select: { title: true, rawText: true } },
      questions: { select: { text: true } },
    },
  });
  const step = steps
    .filter((s) => s.questions.length < MAX_QUESTIONS_PER_STEP)
    .sort(
      (a, b) =>
        a.questions.length - b.questions.length ||
        (b.readOn ?? "").localeCompare(a.readOn ?? "") ||
        a.orderIndex - b.orderIndex,
    )[0];
  if (!step) return 0;

  const generated = await llm.generateQuestions({
    unitTitle: track.unit.name,
    purpose: `Spaced repetition of "${step.title}": short recall questions a student can answer from memory in a few sentences`,
    notesText: `## ${step.content.title} (${step.title})\n${step.content.rawText.slice(step.start, step.end).trim()}`,
    priorQuestions: step.questions.map((q) => q.text),
    count: QUESTIONS_PER_CALL,
    applicationCount: 1,
  });
  if (generated.length === 0) return 0;

  const last = await db.question.aggregate({ where: { questionSetId: track.bankSetId }, _max: { orderIndex: true } });
  const base = (last._max.orderIndex ?? -1) + 1;
  await db.question.createMany({
    data: generated.map((q, i) => ({
      questionSetId: track.bankSetId,
      stepId: step.id,
      text: q.text,
      orderIndex: base + i,
      questionType: q.questionType,
      marks: q.marks,
      markingScheme: q.markingScheme,
    })),
  });
  return generated.length;
}

/**
 * Fills a PENDING session up to `target` questions and records the outcome on it. Never throws: it runs
 * after the HTTP response has been sent, so a failure has to land on the session where the UI shows it.
 */
export async function prepareSession(llm: LLMProvider | null, sessionId: string, target: number, now = new Date()): Promise<void> {
  try {
    const settings = await getReviewSettings();
    const tracks = await getActiveTracks(toDay(now));
    const existing = await db.reviewSessionItem.findMany({
      where: { sessionId },
      select: { questionId: true, question: { select: { questionSet: { select: { unitId: true } } } } },
    });
    const exclude = existing.map((i) => i.questionId);
    const need = target - existing.length;

    let writeError: string | null = null;
    if (need > 0) {
      // Top up the units that are short of never-asked questions, shortest first.
      const supply = await Promise.all(
        tracks.map(async (track) => ({ track, fresh: (await loadCandidates(track, now, exclude)).fresh.length })),
      );
      const short = supply.filter((s) => s.fresh < FRESH_BUFFER).sort((a, b) => a.fresh - b.fresh);
      let calls = 0;
      for (const { track } of short) {
        if (calls >= MAX_GENERATIONS) break;
        try {
          if (!llm) throw new Error("No LLM provider is configured");
          // Counted only when a call was made: a track with nothing left to write costs nothing.
          const hasRoom = await db.studyStep.count({ where: { trackId: track.id, readOn: { not: null } } });
          if (hasRoom === 0) continue;
          calls++;
          await writeQuestionsForTrack(llm, track);
        } catch (err) {
          console.error(`Could not write morning questions for ${track.unit.name}:`, err);
          writeError = err instanceof Error ? err.message : String(err);
        }
      }
    }

    const units = await Promise.all(tracks.map((track) => loadCandidates(track, now, exclude)));
    const unitsCovered = new Set(existing.map((i) => i.question.questionSet.unitId)).size;
    const picks =
      need > 0
        ? composeSession(units, { count: need, minUnits: Math.max(0, settings.minUnits - unitsCovered) })
        : [];

    // Nothing to ask and a write failed: that failure is the reason, so show it.
    const failed = picks.length === 0 && existing.length === 0 && writeError !== null;
    await db.$transaction([
      db.reviewSessionItem.createMany({
        data: picks.map((pick, i) => ({
          sessionId,
          questionId: pick.questionId,
          orderIndex: existing.length + i,
          reason: pick.reason,
        })),
      }),
      db.reviewSession.update({
        where: { id: sessionId },
        data: failed
          ? { status: "FAILED", error: `Could not write today's questions: ${writeError}` }
          : { status: "COMPLETED", error: null },
      }),
    ]);
  } catch (err) {
    console.error(`Morning session ${sessionId} failed:`, err);
    try {
      await db.reviewSession.update({
        where: { id: sessionId },
        data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
      });
    } catch (updateErr) {
      console.error(`Could not record failure for morning session ${sessionId}:`, updateErr);
    }
  }
}
