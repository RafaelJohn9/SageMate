import type { z } from "zod";
import { db } from "@/lib/db";
import { resolveOutline, sectionRange } from "@/lib/outline";
import { planSteps, type PlannedStep } from "@/lib/studyPlan";
import type { saveTrackSchema } from "@/lib/validation/review";

export const BANK_SET_NAME = "Morning repetition";

type TrackInput = z.infer<typeof saveTrackSchema>;

/**
 * Creates the unit's study track, or replaces its dates and material. Throws a RangeError (safe to show
 * the student) when the input does not fit the unit's content.
 *
 * Steps that survive an edit unchanged keep their identity, so what has been read, any briefing, and
 * the questions already written for them are kept. Questions from steps that drop out of the plan stay
 * in the bank and keep coming round.
 */
export async function saveTrack(input: TrackInput) {
  const unit = await db.unit.findUnique({
    where: { id: input.unitId },
    include: { content: true, studyTrack: { include: { steps: true } } },
  });
  if (!unit) throw new RangeError("Unit not found");

  const planned: (PlannedStep & { contentId: string })[] = [];
  const sources: { contentId: string; orderIndex: number; fromSection: number | null; toSection: number | null }[] = [];
  const seen = new Set<string>();

  for (const [orderIndex, source] of input.sources.entries()) {
    const content = unit.content.find((c) => c.id === source.contentId);
    if (!content) throw new RangeError("One of the chosen documents is not in this unit");
    if (seen.has(content.id)) throw new RangeError(`"${content.title}" was chosen twice`);
    seen.add(content.id);

    const outline = resolveOutline(content.outline, content.rawText);
    let range: { start: number; end: number } | undefined;
    let fromSection: number | null = null;
    let toSection: number | null = null;
    if (source.from !== undefined && source.to !== undefined && outline.length > 0) {
      if (source.to >= outline.length) {
        throw new RangeError(`"${content.title}" has only ${outline.length} sections`);
      }
      range = sectionRange(outline, content.rawText.length, source.from, source.to);
      fromSection = source.from;
      toSection = source.to;
    }

    const steps = planSteps(content.rawText, outline, content.title, range);
    if (steps.length === 0) throw new RangeError(`"${content.title}" has no text to study`);
    planned.push(...steps.map((s) => ({ ...s, contentId: content.id })));
    sources.push({ contentId: content.id, orderIndex, fromSection, toSection });
  }

  const key = (s: { contentId: string; start: number; end: number }) => `${s.contentId}:${s.start}:${s.end}`;
  const existing = new Map((unit.studyTrack?.steps ?? []).map((s) => [key(s), s]));
  const keptIds = new Set<string>();

  return db.$transaction(async (tx) => {
    let track = unit.studyTrack;
    if (!track) {
      const bankSet = await tx.questionSet.create({
        data: {
          unitId: unit.id,
          name: BANK_SET_NAME,
          purposeFilter: BANK_SET_NAME,
          kind: "REVIEW",
          status: "COMPLETED",
          provider: "-",
          model: "-",
        },
      });
      track = {
        ...(await tx.studyTrack.create({
          data: { unitId: unit.id, startDate: input.startDate, endDate: input.endDate, bankSetId: bankSet.id },
        })),
        steps: [],
      };
    } else {
      await tx.studyTrack.update({
        where: { id: track.id },
        data: { startDate: input.startDate, endDate: input.endDate },
      });
    }
    const trackId = track.id;

    await tx.studyTrackContent.deleteMany({ where: { trackId } });
    await tx.studyTrackContent.createMany({ data: sources.map((s) => ({ ...s, trackId })) });
    // The bank's sources mirror the track's, so its questions are scoped like any other set's.
    await tx.questionSetContent.deleteMany({ where: { questionSetId: track.bankSetId } });
    await tx.questionSetContent.createMany({
      data: sources.map((s) => ({ questionSetId: track.bankSetId, contentId: s.contentId })),
    });

    for (const [orderIndex, step] of planned.entries()) {
      const match = existing.get(key(step));
      if (match) {
        keptIds.add(match.id);
        await tx.studyStep.update({ where: { id: match.id }, data: { orderIndex, title: step.title } });
      } else {
        await tx.studyStep.create({ data: { ...step, trackId, orderIndex } });
      }
    }
    // Only steps from before this save that found no match are stale.
    const stale = [...existing.values()].map((s) => s.id).filter((id) => !keptIds.has(id));
    await tx.studyStep.deleteMany({ where: { id: { in: stale } } });

    return tx.studyTrack.findUniqueOrThrow({ where: { id: trackId }, include: { steps: true } });
  });
}

/** Removes a unit from the study plan, together with the questions written for it. */
export async function deleteTrack(trackId: string): Promise<boolean> {
  const track = await db.studyTrack.findUnique({ where: { id: trackId } });
  if (!track) return false;
  // Deleting the bank set cascades to the track, its steps, and the bank's questions.
  await db.questionSet.delete({ where: { id: track.bankSetId } });
  return true;
}
