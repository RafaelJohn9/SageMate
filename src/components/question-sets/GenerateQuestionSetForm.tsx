"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Set name (e.g. Unit - CAT 2 Revision - batch 1)"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      />

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Purpose</p>
        <div className="flex flex-wrap gap-2">
          {purposes.length === 0 && <p className="text-sm text-muted-foreground">Add content to this unit first.</p>}
          {purposes.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => togglePurpose(p)}
              className={`rounded-md px-3 py-1 text-sm ${
                selectedPurposes.includes(p)
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Content to draw from</p>
        <div className="flex flex-col gap-1">
          {visibleContent.length === 0 && (
            <p className="text-sm text-muted-foreground">No content matches the selected purpose(s).</p>
          )}
          {visibleContent.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedContentIds.includes(c.id)}
                onChange={() => toggleContent(c.id)}
              />
              <span>
                {c.title}{" "}
                <span className="text-muted-foreground">
                  ({c.contentKind === "PAST_PAPER" ? "past paper" : "notes"} · {c.purpose})
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Number of questions</span>
        <input
          type="number"
          min={3}
          max={15}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-20 rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={submitting !== null}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting === "generate" ? "Generating…" : "Generate questions"}
          </button>
          <button
            type="button"
            onClick={() => submit("extract")}
            disabled={submitting !== null}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
          >
            {submitting === "extract" ? "Extracting…" : "Extract questions only"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Already have questions in your notes or past papers? &ldquo;Extract questions only&rdquo; pulls out the
          questions as written (ignoring the notes and answers) instead of generating new ones. The number of
          questions setting is ignored.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-mark/40 bg-mark-tint p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Revision questions with answers</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A full question bank covering everything you selected, each with a model answer to study from. The
            more material you select, the more questions you get.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => submit("revision")}
            disabled={submitting !== null}
            className="rounded-md bg-mark px-4 py-2 text-sm font-medium text-mark-foreground disabled:opacity-50"
          >
            {submitting === "revision" ? `Writing ${revisionCount} questions and answers…` : "Create revision set"}
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedContentIds.length === 0
              ? "Select content to see how many questions you’ll get."
              : `About ${revisionCount} questions from your selection`}
          </span>
        </div>
        {submitting === "revision" && revisionCount > 30 && (
          <p className="text-xs text-muted-foreground">
            Large selections are written in parts, so this can take a minute or two.
          </p>
        )}
      </div>
    </form>
  );
}
