import Link from "next/link";
import { db } from "@/lib/db";
import { PlanEditor } from "@/components/morning/PlanEditor";
import { getReviewSettings } from "@/lib/morningSession";
import { resolveOutline } from "@/lib/outline";
import { toDay, trackPhase } from "@/lib/studyPlan";

export const dynamic = "force-dynamic";

export default async function MorningPlanPage() {
  const today = toDay(new Date());
  const [settings, units] = await Promise.all([
    getReviewSettings(),
    db.unit.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        content: { orderBy: { createdAt: "asc" } },
        studyTrack: {
          include: {
            sources: { orderBy: { orderIndex: "asc" } },
            steps: { select: { readOn: true } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href="/morning" className="text-sm text-muted-foreground hover:underline">
          ← Morning repetition
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Your study plan</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Which units to keep fresh, what to read in each, how far to get, and by when.
        </p>
      </header>

      <PlanEditor
        today={today}
        settings={{ dailyQuestions: settings.dailyQuestions, minUnits: settings.minUnits }}
        units={units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          content: unit.content.map((c) => ({
            id: c.id,
            title: c.title,
            contentKind: c.contentKind,
            charCount: c.rawText.length,
            sections: resolveOutline(c.outline, c.rawText).map((s) => ({ title: s.title, level: s.level })),
          })),
          track: unit.studyTrack && {
            id: unit.studyTrack.id,
            startDate: unit.studyTrack.startDate,
            endDate: unit.studyTrack.endDate,
            paused: unit.studyTrack.paused,
            phase: trackPhase(unit.studyTrack, today),
            readSteps: unit.studyTrack.steps.filter((s) => s.readOn).length,
            totalSteps: unit.studyTrack.steps.length,
            sources: unit.studyTrack.sources.map((s) => ({
              contentId: s.contentId,
              from: s.fromSection,
              to: s.toSection,
            })),
          },
        }))}
      />
    </div>
  );
}
