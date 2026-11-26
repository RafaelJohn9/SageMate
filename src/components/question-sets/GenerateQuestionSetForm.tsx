"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { buttonPrimary, ChipToggle, FormError, FormSection, inputClass } from "@/components/ui/form";
import { errorMessage } from "@/lib/apiError";
import { formatCharCount } from "@/lib/formatting";
import { revisionQuestionCount } from "@/lib/llm/revisionPlan";
import {
  isWholeDocument,
  isWithin,
  keptSpans,
  lastCoveredSection,
  sectionScope,
  type OutlineSection,
} from "@/lib/outline";

type ContentOption = {
  id: string;
  title: string;
  purpose: string;
  contentKind: "NOTES" | "PAST_PAPER";
  charCount: number;
  outline: OutlineSection[];
};

// Section indices into the content's outline: from..to inclusive, minus the ones in `exclude`.
type Range = { from: number; to: number; exclude: number[] };

type Mode = "generate" | "extract" | "revision";

const FALLBACK_ERRORS: Record<Mode, string> = {
  generate: "Could not generate questions.",
  extract: "Could not extract questions.",
  revision: "Could not create the revision set.",
};

export function GenerateQuestionSetForm({
  unitId,
  content,
}: {
  unitId: string;
  content: ContentOption[];
}) {
  const router = useRouter();
  const purposes = useMemo(() => Array.from(new Set(content.map((c) => c.purpose))), [content]);

  const [name, setName] = useState("");
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  // Chapter ranges per content id; absent means the whole document.
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Mode | null>(null);

  function togglePurpose(p: string) {
    setSelectedPurposes((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      const eligibleIds = content.filter((c) => next.includes(c.purpose)).map((c) => c.id);
      setSelectedContentIds((prevIds) => prevIds.filter((id) => eligibleIds.includes(id)));
      return next;
    });
  }

  function toggleContent(id: string) {
    setSelectedContentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function setRange(c: ContentOption, range: Range) {
    setRanges((prev) => {
      const next = { ...prev };
      if (isWholeDocument(c.outline, range.from, range.to) && range.exclude.length === 0) delete next[c.id];
      else next[c.id] = range;
      return next;
    });
  }

  function scopedChars(c: ContentOption): number {
    const range = ranges[c.id];
    if (!range) return c.charCount;
    const { range: span, excluded } = sectionScope(c.outline, c.charCount, range.from, range.to, range.exclude);
    return keptSpans(span.start, span.end, excluded).reduce((sum, s) => sum + s.end - s.start, 0);
  }

  const selectedChars = content
    .filter((c) => selectedContentIds.includes(c.id))
    .reduce((sum, c) => sum + scopedChars(c), 0);
  const revisionCount = revisionQuestionCount(selectedChars);

  const visibleContent =
    selectedPurposes.length === 0 ? content : content.filter((c) => selectedPurposes.includes(c.purpose));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submit("generate");
  }

  async function submit(mode: Mode) {
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (selectedPurposes.length === 0) {
      setError("Select at least one purpose.");
      return;
    }
    if (selectedContentIds.length === 0) {
      setError("Select at least one content item.");
      return;
    }

    setSubmitting(mode);
    const res = await fetch(`/api/units/${unitId}/question-sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        purposeFilter: selectedPurposes,
        contentIds: selectedContentIds,
        ranges: Object.fromEntries(Object.entries(ranges).filter(([id]) => selectedContentIds.includes(id))),
        // Only "generate" uses the count; extract and revision decide it from the content.
        ...(mode === "generate" ? { count } : {}),
        mode,
      }),
    });
    setSubmitting(null);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = errorMessage(body?.error) ?? FALLBACK_ERRORS[mode];
      setError(message);
      return;
    }

    const { questionSet } = await res.json();
    router.push(`/question-sets/${questionSet.id}`);
    router.refresh();
  }

  const busy = submitting !== null;

  return (
    <form onSubmit={handleSubmit} className="border-t border-border" noValidate>
      <FormSection title="Name" hint="Something you will recognise later." htmlFor="set-name">
        <input
          id="set-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CAT 2 revision, batch 1"
          className={inputClass}
        />
      </FormSection>

      <FormSection title="Purpose" hint="Which test or exam is this revision for?">
        {purposes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add content to this unit first, then choose a purpose.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {purposes.map((p) => (
              <ChipToggle key={p} checked={selectedPurposes.includes(p)} onChange={() => togglePurpose(p)}>
                {p}
              </ChipToggle>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="Sources"
        hint="Tick the notes and past papers to draw from. For long notes, pick the chapters to cover."
      >
        {visibleContent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing matches the purposes you chose.</p>
        ) : (
          <ul className="border-t border-border">
            {visibleContent.map((c) => {
              const checked = selectedContentIds.includes(c.id);
              const range = ranges[c.id];
              return (
                <li key={c.id} className="border-b border-border">
                  <label className="flex cursor-pointer items-start gap-3 py-2.5 transition-colors hover:bg-card/70">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleContent(c.id)}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-foreground">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.contentKind === "PAST_PAPER" ? "Past paper" : "Notes"} · {c.purpose} ·{" "}
                        {range
                          ? `${formatCharCount(scopedChars(c))} of ${formatCharCount(c.charCount)}`
                          : formatCharCount(c.charCount)}
                      </span>
                    </span>
                  </label>
                  {checked && c.outline.length >= 2 && (
                    <SectionRangePicker
                      content={c}
                      range={range ?? { from: 0, to: c.outline.length - 1, exclude: [] }}
                      scoped={range !== undefined}
                      onChange={(r) => setRange(c, r)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {selectedContentIds.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {selectedContentIds.length} selected, {formatCharCount(selectedChars)} in total.
          </p>
        )}
      </FormSection>

      <FormSection title="What to make" hint="Pick one. Each button creates the set straight away.">
        {error && (
          <div className="mb-3">
            <FormError>{error}</FormError>
          </div>
        )}
        <ul className="border-t border-border">
          <ActionRow
            title="Write new questions"
            description="Fresh exam-style questions from your sources, phrased like any past papers you ticked."
            action={
              <button type="submit" disabled={busy} className={buttonPrimary}>
                {submitting === "generate" ? "Generating…" : "Generate questions"}
              </button>
            }
          >
            <label className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">How many</span>
              <input
                type="number"
                min={3}
                max={15}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className={`${inputClass} w-20! py-1!`}
              />
              <span className="text-xs text-muted-foreground">3 to 15</span>
            </label>
          </ActionRow>

          <ActionRow
            title="Pull out existing questions"
            description="Copies the questions already in your notes or past papers, word for word. The number above does not apply."
            action={
              <button type="button" onClick={() => submit("extract")} disabled={busy} className={buttonPrimary}>
                {submitting === "extract" ? "Extracting…" : "Extract questions"}
              </button>
            }
          />

          <ActionRow
            title="Build a revision set with answers"
            description="A question bank covering everything you ticked, each with a model answer to study from. More material means more questions."
            action={
              <button type="button" onClick={() => submit("revision")} disabled={busy} className={buttonPrimary}>
                {submitting === "revision" ? "Writing…" : "Create revision set"}
              </button>
            }
          >
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {submitting === "revision"
                ? `Writing ${revisionCount} questions and answers${
                    revisionCount > 30 ? ". Large selections are written in parts, so this can take a minute or two" : ""
                  }.`
                : selectedContentIds.length === 0
                  ? "Tick some sources to see how many questions you will get."
                  : `About ${revisionCount} questions from your selection.`}
            </p>
          </ActionRow>
        </ul>
      </FormSection>
    </form>
  );
}

function sectionOptionLabel(section: OutlineSection): string {
  // Native <option>s ignore padding, so subsections are indented with non-breaking spaces.
  return `${"\u00a0\u00a0\u00a0".repeat(section.level - 1)}${section.title}`;
}

function SectionRangePicker({
  content,
  range,
  scoped,
  onChange,
}: {
  content: ContentOption;
  range: Range;
  scoped: boolean;
  onChange: (range: Range) => void;
}) {
  const fromId = `range-from-${content.id}`;
  const toId = `range-to-${content.id}`;
  const selectClass = `${inputClass} py-1! sm:w-auto! sm:max-w-56`;
  const { label } = sectionScope(content.outline, content.charCount, range.from, range.to, range.exclude);
  // Changing the range drops any left-out sections that are no longer inside it.
  const withBounds = (from: number, to: number): Range => ({
    from,
    to,
    exclude: range.exclude.filter((i) => i >= from && i <= lastCoveredSection(content.outline, to)),
  });

  return (
    <div
      role="group"
      aria-label={`Chapters to cover from ${content.title}`}
      className="mb-3 ml-[0.4rem] border-l-2 border-border pl-[1.1rem]"
    >
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
        <label htmlFor={fromId} className="text-muted-foreground">
          From
        </label>
        <select
          id={fromId}
          value={range.from}
          // Moving the start past the end drags the end along, so the range stays valid.
          onChange={(e) => {
            const from = Number(e.target.value);
            onChange(withBounds(from, Math.max(from, range.to)));
          }}
          className={selectClass}
        >
          {content.outline.map((section, i) => (
            <option key={i} value={i}>
              {sectionOptionLabel(section)}
            </option>
          ))}
        </select>
        <label htmlFor={toId} className="text-muted-foreground">
          through
        </label>
        <select
          id={toId}
          value={range.to}
          onChange={(e) => {
            const to = Number(e.target.value);
            onChange(withBounds(Math.min(range.from, to), to));
          }}
          className={selectClass}
        >
          {content.outline.map((section, i) => (
            <option key={i} value={i}>
              {sectionOptionLabel(section)}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
        {scoped ? (
          <>
            Covering {label}.{" "}
            <button
              type="button"
              onClick={() => onChange({ from: 0, to: content.outline.length - 1, exclude: [] })}
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Use the whole document
            </button>
          </>
        ) : (
          `Covering the whole document, ${content.outline.length} sections found.`
        )}
      </p>
      {lastCoveredSection(content.outline, range.to) > range.from && (
        <LeaveOutList
          content={content}
          range={range}
          onChange={(exclude) => onChange({ ...range, exclude })}
        />
      )}
    </div>
  );
}

/** Checkboxes for the sections inside the range, to drop subtopics that are not being examined. */
function LeaveOutList({
  content,
  range,
  onChange,
}: {
  content: ContentOption;
  range: Range;
  onChange: (exclude: number[]) => void;
}) {
  const last = lastCoveredSection(content.outline, range.to);
  const indices = Array.from({ length: last - range.from + 1 }, (_, k) => range.from + k);
  const count = range.exclude.length;
  const [open, setOpen] = useState(count > 0);

  return (
    <details className="mt-2" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="w-fit cursor-pointer text-xs text-foreground underline underline-offset-2 marker:text-muted-foreground hover:no-underline">
        {count === 0 ? "Leave out sections" : `Leaving out ${count} ${count === 1 ? "section" : "sections"}`}
      </summary>
      <ul className="mt-2 max-h-60 overflow-y-auto rounded-md border border-border bg-card py-1">
        {indices.map((i) => {
          const section = content.outline[i];
          const parent = range.exclude.find((j) => isWithin(content.outline, i, j));
          const leftOut = parent !== undefined || range.exclude.includes(i);
          return (
            <li key={i}>
              <label
                className={`flex items-start gap-2 py-1 pr-3 text-sm ${
                  parent !== undefined ? "cursor-default opacity-60" : "cursor-pointer hover:bg-background/60"
                }`}
                style={{ paddingLeft: `${0.75 + (section.level - 1) * 1.1}rem` }}
              >
                <input
                  type="checkbox"
                  checked={leftOut}
                  disabled={parent !== undefined}
                  onChange={() =>
                    onChange(
                      range.exclude.includes(i)
                        ? range.exclude.filter((j) => j !== i)
                        : // Leaving out a section covers its subsections, so drop their own ticks.
                          [...range.exclude.filter((j) => !isWithin(content.outline, j, i)), i],
                    )
                  }
                  className="mt-0.5 size-3.5 shrink-0 accent-primary"
                />
                <span className={leftOut ? "text-muted-foreground line-through" : "text-foreground"}>
                  {section.title}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ActionRow({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="max-w-md">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
