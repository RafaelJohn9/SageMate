"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

type ContentOption = {
  id: string;
  title: string;
  purpose: string;
  contentKind: "NOTES" | "PAST_PAPER";
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const visibleContent =
    selectedPurposes.length === 0 ? content : content.filter((c) => selectedPurposes.includes(c.purpose));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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

    setSubmitting(true);
    const res = await fetch(`/api/units/${unitId}/question-sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        purposeFilter: selectedPurposes,
        contentIds: selectedContentIds,
        count,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = typeof body?.error === "string" ? body.error : "Could not generate questions.";
      setError(message);
      return;
    }

    const { questionSet } = await res.json();
    router.push(`/question-sets/${questionSet.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Set name (e.g. Unit - CAT 2 Revision - batch 1)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Purpose</p>
        <div className="flex flex-wrap gap-2">
          {purposes.length === 0 && <p className="text-sm text-zinc-500">Add content to this unit first.</p>}
          {purposes.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => togglePurpose(p)}
              className={`rounded-md px-3 py-1 text-sm ${
                selectedPurposes.includes(p)
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Content to draw from</p>
        <div className="flex flex-col gap-1">
          {visibleContent.length === 0 && (
            <p className="text-sm text-zinc-500">No content matches the selected purpose(s).</p>
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
                <span className="text-zinc-400">
                  ({c.contentKind === "PAST_PAPER" ? "past paper" : "notes"} · {c.purpose})
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Number of questions</span>
        <input
          type="number"
          min={3}
          max={15}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-20 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "Generating…" : "Generate questions"}
      </button>
    </form>
  );
}
