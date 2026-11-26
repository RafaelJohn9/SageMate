"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonSecondary } from "@/components/ui/form";
import { Markdown } from "@/components/ui/Markdown";

export type ReadingStep = {
  id: string;
  title: string;
  /** The document the step comes from, shown when a track has more than one. */
  source: string | null;
  minutes: number;
  read: boolean;
  briefing: string | null;
};

export function TrackReading({
  unitId,
  unitName,
  steps,
  todayIds,
  dailyMinutes,
  daysLeft,
}: {
  unitId: string;
  unitName: string;
  steps: ReadingStep[];
  todayIds: string[];
  dailyMinutes: number;
  daysLeft: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefings, setBriefings] = useState<Record<string, string>>({});
  const [openBriefing, setOpenBriefing] = useState<string | null>(null);
  const [briefingFor, setBriefingFor] = useState<string | null>(null);

  const readCount = steps.filter((s) => s.read).length;
  const today = steps.filter((s) => todayIds.includes(s.id));
  const finished = readCount === steps.length;

  async function mark(stepId: string, read: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/review/steps/${stepId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save that. Try again.");
      return;
    }
    router.refresh();
  }

  async function toggleBriefing(step: ReadingStep) {
    if (openBriefing === step.id) {
      setOpenBriefing(null);
      return;
    }
    setOpenBriefing(step.id);
    if (step.briefing || briefings[step.id]) return;

    setBriefingFor(step.id);
    setError(null);
    const res = await fetch(`/api/review/steps/${step.id}/briefing`, { method: "POST" });
    setBriefingFor(null);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.briefing) {
      setOpenBriefing(null);
      setError(typeof body?.error === "string" ? body.error : "Could not write the briefing. Try again.");
      return;
    }
    setBriefings((prev) => ({ ...prev, [step.id]: body.briefing }));
  }

  return (
    <li className="border-b border-border py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
          <Link href={`/units/${unitId}`} className="hover:underline">
            {unitName}
          </Link>
        </h3>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            role="progressbar"
            aria-label="Parts read"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={readCount}
            className="h-1 w-16 overflow-hidden rounded-full bg-border"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${(readCount / Math.max(1, steps.length)) * 100}%` }}
            />
          </span>
          {readCount} of {steps.length} parts read, {daysLeft} day{daysLeft === 1 ? "" : "s"} left
        </p>
      </div>

      {finished ? (
        <p className="mt-2 text-sm text-muted-foreground">
          All read. From here on this unit is review only, until its end date.
        </p>
      ) : today.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Today&rsquo;s reading is done. More tomorrow.</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            To read today, about {today.reduce((sum, s) => sum + s.minutes, 0)} min. Tick each part when you
            finish it; tomorrow&rsquo;s questions will draw on it.
          </p>
          <ul className="mt-1">
            {today.map((step) => {
              const briefing = step.briefing ?? briefings[step.id];
              return (
                <li key={step.id} className="py-1.5">
                  <div className="flex items-start gap-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={busy}
                        onChange={() => mark(step.id, true)}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="text-foreground">{step.title}</span>
                        {step.source && <span className="block text-xs text-muted-foreground">{step.source}</span>}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleBriefing(step)}
                      aria-expanded={openBriefing === step.id}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      {openBriefing === step.id ? "Hide primer" : "Prime me first"}
                    </button>
                  </div>
                  {openBriefing === step.id && (
                    <div className="mt-2 ml-7 max-w-xl border-l-2 border-highlight pl-3 text-sm text-foreground">
                      {briefingFor === step.id ? (
                        <p className="text-xs text-muted-foreground">Writing what to look out for…</p>
                      ) : (
                        briefing && <Markdown>{briefing}</Markdown>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {today.length > 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => mark(today.at(-1)!.id, true)}
              className={`${buttonSecondary} mt-2 py-1.5! text-xs!`}
            >
              Tick all of today&rsquo;s reading
            </button>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <details className="mt-3">
        <summary className="w-fit cursor-pointer text-xs text-foreground underline underline-offset-2 marker:text-muted-foreground hover:no-underline">
          All {steps.length} parts{dailyMinutes > 0 && !finished ? `, about ${dailyMinutes} min a day` : ""}
        </summary>
        <p className="mt-2 max-w-xl text-xs text-muted-foreground">
          Reading goes in order: ticking a part ticks everything before it, and unticking one unticks
          everything after it.
        </p>
        <ol className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border bg-card py-1">
          {steps.map((step) => (
            <li key={step.id}>
              <label className="flex cursor-pointer items-start gap-2 px-3 py-1 text-sm hover:bg-background/60">
                <input
                  type="checkbox"
                  checked={step.read}
                  disabled={busy}
                  onChange={() => mark(step.id, !step.read)}
                  className="mt-0.5 size-3.5 shrink-0 accent-primary"
                />
                <span className={step.read ? "text-muted-foreground" : "text-foreground"}>
                  {step.title}
                  {todayIds.includes(step.id) && (
                    <span className="ml-2 rounded-[3px] bg-highlight px-1 text-xs text-highlight-foreground">today</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
