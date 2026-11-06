"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { buttonPrimary, ChipToggle, FormError, FormSection, inputClass } from "@/components/ui/form";
import { formatCharCount } from "@/lib/formatting";
import { revisionQuestionCount } from "@/lib/llm/revisionPlan";

type ContentOption = {
  id: string;
  title: string;
  purpose: string;
  contentKind: "NOTES" | "PAST_PAPER";
  charCount: number;
};

type Mode = "generate" | "extract" | "revision";

const FALLBACK_ERRORS: Record<Mode, string> = {
  generate: "Could not generate questions.",
  extract: "Could not extract questions.",
  revision: "Could not create the revision set.",
};

// The API returns either a plain string or zod's flattened errors ({ formErrors, fieldErrors }).
function errorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const { formErrors = [], fieldErrors = {} } = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const messages = [...formErrors, ...Object.values(fieldErrors).flatMap((m) => m ?? [])];
    if (messages.length > 0) return messages.join(" ");
  }
  return null;
}

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

  const selectedChars = content
    .filter((c) => selectedContentIds.includes(c.id))
    .reduce((sum, c) => sum + c.charCount, 0);
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

      <FormSection title="Sources" hint="Tick the notes and past papers to draw from.">
        {visibleContent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing matches the purposes you chose.</p>
        ) : (
          <ul className="border-t border-border">
            {visibleContent.map((c) => (
              <li key={c.id} className="border-b border-border">
                <label className="flex cursor-pointer items-start gap-3 py-2.5 transition-colors hover:bg-card/70">
                  <input
                    type="checkbox"
                    checked={selectedContentIds.includes(c.id)}
                    onChange={() => toggleContent(c.id)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium text-foreground">{c.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.contentKind === "PAST_PAPER" ? "Past paper" : "Notes"} · {c.purpose} ·{" "}
                      {formatCharCount(c.charCount)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
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
