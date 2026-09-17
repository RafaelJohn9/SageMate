"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const PURPOSE_PRESETS = ["GENERAL", "CAT1", "CAT2", "EXAM"];

export function AddContentForm({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [title, setTitle] = useState("");
  const [contentKind, setContentKind] = useState<"NOTES" | "PAST_PAPER">("NOTES");
  const [purpose, setPurpose] = useState("GENERAL");
  const [customPurpose, setCustomPurpose] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resolvedPurpose = purpose === "CUSTOM" ? customPurpose.trim() : purpose;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!resolvedPurpose) {
      setError("Purpose is required.");
      return;
    }
    if (mode === "paste" && !text.trim()) {
      setError("Paste some text or switch to file upload.");
      return;
    }
    if (mode === "upload" && !file) {
      setError("Choose a PDF or DOCX file.");
      return;
    }

    setSubmitting(true);

    let res: Response;
    if (mode === "paste") {
      res = await fetch(`/api/units/${unitId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, contentKind, purpose: resolvedPurpose, text }),
      });
    } else {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("contentKind", contentKind);
      formData.set("purpose", resolvedPurpose);
      formData.set("file", file as File);
      res = await fetch(`/api/units/${unitId}/content`, { method: "POST", body: formData });
    }

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not add content.");
      return;
    }

    router.push(`/units/${unitId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded-md px-3 py-1.5 ${mode === "paste" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}
        >
          Paste text
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-md px-3 py-1.5 ${mode === "upload" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}
        >
          Upload PDF/DOCX
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Lecture 3 notes, CAT 1 2025 paper)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Kind</span>
          <select
            value={contentKind}
            onChange={(e) => setContentKind(e.target.value as "NOTES" | "PAST_PAPER")}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="NOTES">Notes / assignment</option>
            <option value="PAST_PAPER">Past CAT/exam paper</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Purpose</span>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {PURPOSE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="CUSTOM">Custom…</option>
          </select>
        </label>

        {purpose === "CUSTOM" && (
          <input
            value={customPurpose}
            onChange={(e) => setCustomPurpose(e.target.value)}
            placeholder="e.g. CAT3"
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        )}
      </div>

      {mode === "paste" ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste notes, assignment, or past paper text here…"
          rows={10}
          className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
      ) : (
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting ? "Adding…" : "Add content"}
      </button>
    </form>
  );
}
