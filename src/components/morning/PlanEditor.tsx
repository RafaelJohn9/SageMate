"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonPrimary, buttonSecondary, FormError, FormSection, inputClass } from "@/components/ui/form";
import { errorMessage } from "@/lib/apiError";
import { formatCharCount } from "@/lib/formatting";
import { addDays, dayToDate, daysBetween } from "@/lib/studyPlan";

type Section = { title: string; level: number };
type ContentOption = {
  id: string;
  title: string;
  contentKind: "NOTES" | "PAST_PAPER";
  charCount: number;
  sections: Section[];
};
type Source = { contentId: string; from: number | null; to: number | null };
type Track = {
  id: string;
  startDate: string;
  endDate: string;
  paused: boolean;
  phase: "upcoming" | "active" | "finished";
  readSteps: number;
  totalSteps: number;
  sources: Source[];
};
type UnitOption = { id: string; name: string; content: ContentOption[]; track: Track | null };
type Settings = { dailyQuestions: number; minUnits: number };

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const formatDay = (day: string) => shortDate.format(dayToDate(day));

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.ok) return null;
  const payload = await res.json().catch(() => null);
  return errorMessage(payload?.error) ?? "Could not save that. Try again.";
}

export function PlanEditor({ today, settings, units }: { today: string; settings: Settings; units: UnitOption[] }) {
  // The unit whose track form is open; "new" while choosing a unit to add.
  const [editing, setEditing] = useState<string | null>(null);
  const planned = units.filter((u) => u.track);
  const available = units.filter((u) => !u.track && u.content.length > 0);
  const running = planned.filter((u) => !u.track!.paused && u.track!.phase === "active").length;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Units in the plan</h2>
        {planned.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            No units yet. Add the first one below.
          </p>
        ) : (
          <ul className="border-t border-border">
            {planned.map((unit) =>
              editing === unit.id ? (
                <li key={unit.id} className="border-b border-border py-4">
                  <TrackForm today={today} unit={unit} units={[unit]} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <TrackRow key={unit.id} unit={unit} today={today} onEdit={() => setEditing(unit.id)} />
              ),
            )}
          </ul>
        )}

        {editing === "new" ? (
          <div className="border-l-2 border-mark/35 pl-5">
            <TrackForm today={today} unit={null} units={available} onDone={() => setEditing(null)} />
          </div>
        ) : available.length > 0 ? (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="w-fit rounded-md text-sm font-medium text-primary hover:underline"
          >
            + Add a unit
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {units.length === planned.length && units.length > 0
              ? "Every unit is in the plan."
              : "Units appear here once they have some content."}
          </p>
        )}
      </section>

      <SettingsForm settings={settings} running={running} />
    </div>
  );
}

function TrackRow({ unit, today, onEdit }: { unit: UnitOption; today: string; onEdit: () => void }) {
  const router = useRouter();
  const track = unit.track!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(await send(url, method, body));
    setBusy(false);
    router.refresh();
  }

  const state = track.paused
    ? "Paused"
    : track.phase === "upcoming"
      ? `Starts in ${daysBetween(today, track.startDate)} day${daysBetween(today, track.startDate) === 1 ? "" : "s"}`
      : track.phase === "finished"
        ? "Ended"
        : `${daysBetween(today, track.endDate) + 1} day${daysBetween(today, track.endDate) === 0 ? "" : "s"} left`;

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{unit.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDay(track.startDate)} to {formatDay(track.endDate)}, {state.toLowerCase()}. {track.sources.length}{" "}
          document{track.sources.length === 1 ? "" : "s"}, {track.readSteps} of {track.totalSteps} parts read.
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs">
        <button type="button" onClick={onEdit} disabled={busy} className="font-medium text-primary hover:underline">
          Edit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(`/api/review/tracks/${track.id}`, "PATCH", { paused: !track.paused })}
          className="text-muted-foreground hover:underline"
        >
          {track.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`Remove ${unit.name} from the plan? The morning questions written for it, and your answers to them, are deleted. Your notes and question sets are not.`)) {
              run(`/api/review/tracks/${track.id}`, "DELETE");
            }
          }}
          className="text-danger hover:underline"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

// Native <option>s ignore padding, so subsections are indented with non-breaking spaces.
const optionLabel = (section: Section) => `${"   ".repeat(section.level - 1)}${section.title}`;

function TrackForm({
  today,
  unit,
  units,
  onDone,
}: {
  today: string;
  /** The unit being edited, or null when adding one. */
  unit: UnitOption | null;
  units: UnitOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(unit?.id ?? units[0]?.id ?? "");
  const [startDate, setStartDate] = useState(unit?.track?.startDate ?? today);
  const [endDate, setEndDate] = useState(unit?.track?.endDate ?? addDays(today, 28));
  // Chosen documents by content id. `from`/`to` are section indices; null means the whole document.
  const [sources, setSources] = useState<Record<string, { from: number | null; to: number | null }>>(() =>
    Object.fromEntries((unit?.track?.sources ?? []).map((s) => [s.contentId, { from: s.from, to: s.to }])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenUnit = units.find((u) => u.id === unitId);
  const content = chosenUnit?.content ?? [];
  const days = startDate && endDate ? daysBetween(startDate, endDate) + 1 : 0;
  const chosen = content.filter((c) => sources[c.id]);

  function toggle(c: ContentOption) {
    setSources((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = { from: null, to: null };
      return next;
    });
  }

  function setRange(c: ContentOption, from: number, to: number) {
    const whole = from === 0 && to === c.sections.length - 1;
    setSources((prev) => ({ ...prev, [c.id]: whole ? { from: null, to: null } : { from, to } }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (chosen.length === 0) {
      setError("Tick at least one document to read.");
      return;
    }
    setSaving(true);
    const failure = await send("/api/review/tracks", "POST", {
      unitId,
      startDate,
      endDate,
      sources: chosen.map((c) => {
        const { from, to } = sources[c.id];
        return from === null || to === null ? { contentId: c.id } : { contentId: c.id, from, to };
      }),
    });
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {unit ? (
        <p className="font-medium text-foreground">{unit.name}</p>
      ) : (
        <FormSection title="Unit" htmlFor="track-unit">
          <select
            id="track-unit"
            value={unitId}
            onChange={(e) => {
              setUnitId(e.target.value);
              setSources({});
            }}
            className={inputClass}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </FormSection>
      )}

      <FormSection title="Dates" hint="The reading is shared out evenly between these two days.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="track-start" className="text-muted-foreground">
            From
          </label>
          <input
            id="track-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={`${inputClass} w-auto!`}
          />
          <label htmlFor="track-end" className="text-muted-foreground">
            until
          </label>
          <input
            id="track-end"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={`${inputClass} w-auto!`}
          />
        </div>
        {days > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {days} day{days === 1 ? "" : "s"}. Every question comes back at least once more before the end date.
          </p>
        )}
      </FormSection>

      <FormSection
        title="What to read"
        hint="Tick the documents to work through, in the order listed. For each, say how far you want to get."
      >
        {content.length === 0 ? (
          <p className="text-sm text-muted-foreground">This unit has no content yet.</p>
        ) : (
          <ul className="border-t border-border">
            {content.map((c) => {
              const source = sources[c.id];
              const from = source?.from ?? 0;
              const to = source?.to ?? c.sections.length - 1;
              return (
                <li key={c.id} className="border-b border-border">
                  <label className="flex cursor-pointer items-start gap-3 py-2.5 transition-colors hover:bg-card/70">
                    <input
                      type="checkbox"
                      checked={source !== undefined}
                      onChange={() => toggle(c)}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-foreground">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.contentKind === "PAST_PAPER" ? "Past paper" : "Notes"}, {formatCharCount(c.charCount)}
                      </span>
                    </span>
                  </label>
                  {source &&
                    (c.sections.length >= 2 ? (
                      <div
                        role="group"
                        aria-label={`How far to get in ${c.title}`}
                        className="mb-3 ml-[0.4rem] flex flex-col gap-2 border-l-2 border-border pl-[1.1rem] text-sm sm:flex-row sm:flex-wrap sm:items-center"
                      >
                        <label htmlFor={`from-${c.id}`} className="text-muted-foreground">
                          Start at
                        </label>
                        <select
                          id={`from-${c.id}`}
                          value={from}
                          onChange={(e) => setRange(c, Number(e.target.value), Math.max(Number(e.target.value), to))}
                          className={`${inputClass} py-1! sm:w-auto! sm:max-w-56`}
                        >
                          {c.sections.map((section, i) => (
                            <option key={i} value={i}>
                              {optionLabel(section)}
                            </option>
                          ))}
                        </select>
                        <label htmlFor={`to-${c.id}`} className="text-muted-foreground">
                          and reach the end of
                        </label>
                        <select
                          id={`to-${c.id}`}
                          value={to}
                          onChange={(e) => setRange(c, Math.min(from, Number(e.target.value)), Number(e.target.value))}
                          className={`${inputClass} py-1! sm:w-auto! sm:max-w-56`}
                        >
                          {c.sections.map((section, i) => (
                            <option key={i} value={i}>
                              {optionLabel(section)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="mb-3 ml-7 text-xs text-muted-foreground">
                        No chapters were found in this document, so the plan covers all of it.
                      </p>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </FormSection>

      {error && (
        <div className="pb-3">
          <FormError>{error}</FormError>
        </div>
      )}
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving || !unitId} className={buttonPrimary}>
          {saving ? "Saving…" : unit ? "Save changes" : "Add to the plan"}
        </button>
        <button type="button" onClick={onDone} disabled={saving} className={buttonSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SettingsForm({ settings, running }: { settings: Settings; running: number }) {
  const router = useRouter();
  const [dailyQuestions, setDailyQuestions] = useState(settings.dailyQuestions);
  const [minUnits, setMinUnits] = useState(settings.minUnits);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = dailyQuestions !== settings.dailyQuestions || minUnits !== settings.minUnits;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    const failure = await send("/api/review/settings", "PUT", { dailyQuestions, minUnits });
    setSaving(false);
    setError(failure);
    if (!failure) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Each morning</h2>
      <form onSubmit={handleSubmit} className="border-t border-border" noValidate>
        <FormSection
          title="Questions"
          hint="Few enough to do every day without fail. You can always ask for another round."
          htmlFor="daily-questions"
        >
          <input
            id="daily-questions"
            type="number"
            min={1}
            max={20}
            value={dailyQuestions}
            onChange={(e) => {
              setDailyQuestions(Number(e.target.value));
              setSaved(false);
            }}
            className={`${inputClass} w-24!`}
          />
        </FormSection>
        <FormSection
          title="Units to mix"
          hint="The questions come from at least this many units, when that many have something to ask."
          htmlFor="min-units"
        >
          <input
            id="min-units"
            type="number"
            min={1}
            max={10}
            value={minUnits}
            onChange={(e) => {
              setMinUnits(Number(e.target.value));
              setSaved(false);
            }}
            className={`${inputClass} w-24!`}
          />
          {running < minUnits && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {running === 0 ? "No units are" : running === 1 ? "Only 1 unit is" : `Only ${running} units are`} running
              today, so mornings will draw on fewer than {minUnits} until you add more.
            </p>
          )}
          {minUnits > dailyQuestions && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              With {dailyQuestions} question{dailyQuestions === 1 ? "" : "s"} a morning, at most {dailyQuestions} unit
              {dailyQuestions === 1 ? "" : "s"} can be covered.
            </p>
          )}
        </FormSection>
        <div className="flex items-center gap-3 pt-4">
          <button type="submit" disabled={saving || !changed} className={buttonPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && !changed && <p className="text-sm text-success">Saved.</p>}
          {error && <FormError>{error}</FormError>}
        </div>
      </form>
    </section>
  );
}
