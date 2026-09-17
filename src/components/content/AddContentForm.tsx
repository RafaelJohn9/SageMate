"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const PURPOSE_PRESETS = ["GENERAL", "CAT1", "CAT2", "EXAM"];

function titleFromFilename(filename: string): string {
  return filename.replace(/\.(pdf|docx)$/i, "").replace(/[-_]+/g, " ").trim();
}

type PendingFile = { file: File; title: string };

export function AddContentForm({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [title, setTitle] = useState("");
  const [contentKind, setContentKind] = useState<"NOTES" | "PAST_PAPER">("NOTES");
  const [purpose, setPurpose] = useState("GENERAL");
  const [customPurpose, setCustomPurpose] = useState("");
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const resolvedPurpose = purpose === "CUSTOM" ? customPurpose.trim() : purpose;

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const additions = Array.from(fileList).map((file) => ({ file, title: titleFromFilename(file.name) }));
    setPendingFiles((prev) => [...prev, ...additions]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function renamePendingFile(index: number, newTitle: string) {
    setPendingFiles((prev) => prev.map((p, i) => (i === index ? { ...p, title: newTitle } : p)));
  }

  async function uploadOne(pending: PendingFile): Promise<string | null> {
    const formData = new FormData();
    formData.set("title", pending.title || titleFromFilename(pending.file.name));
    formData.set("contentKind", contentKind);
    formData.set("purpose", resolvedPurpose);
    formData.set("file", pending.file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    let res: Response;
    try {
      res = await fetch(`/api/units/${unitId}/content`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return `Timed out uploading "${pending.file.name}" — the file may be too large or complex.`;
      }
      return `Network error uploading "${pending.file.name}".`;
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) return null;
    const body = await res.json().catch(() => null);
    return typeof body?.error === "string" ? body.error : `Failed to upload "${pending.file.name}"`;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!resolvedPurpose) {
      setError("Purpose is required.");
      return;
    }

    if (mode === "paste") {
      if (!title.trim()) {
        setError("Title is required.");
        return;
      }
      if (!text.trim()) {
        setError("Paste some text or switch to file upload.");
        return;
      }
      setSubmitting(true);
      const res = await fetch(`/api/units/${unitId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, contentKind, purpose: resolvedPurpose, text }),
      });
      setSubmitting(false);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : "Could not add content.");
        return;
      }
      router.push(`/units/${unitId}`);
      router.refresh();
      return;
    }

    if (pendingFiles.length === 0) {
      setError("Choose one or more PDF or DOCX files.");
      return;
    }

    setSubmitting(true);
    setProgress({ done: 0, total: pendingFiles.length });
    const failed: PendingFile[] = [];
    const errorMessages: string[] = [];
    for (const pending of pendingFiles) {
      const err = await uploadOne(pending);
      if (err) {
        failed.push(pending);
        errorMessages.push(err);
      }
      setProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
    }
    setSubmitting(false);
    setProgress(null);

    if (failed.length > 0) {
      setError(`${failed.length} of ${pendingFiles.length} file(s) failed: ${errorMessages.join("; ")}`);
      setPendingFiles(failed);
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

      {mode === "paste" && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Lecture 3 notes, CAT 1 2025 paper)"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}

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
        <div className="flex flex-col gap-2">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            className="text-sm"
          />
          <p className="text-xs text-zinc-400">Kind and purpose above apply to all selected files.</p>
          {pendingFiles.length > 0 && (
            <ul className="flex flex-col gap-2">
              {pendingFiles.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    value={p.title}
                    onChange={(e) => renamePendingFile(i, e.target.value)}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <span className="text-xs text-zinc-400">{p.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {progress && (
        <p className="text-sm text-zinc-500">
          Uploading {progress.done}/{progress.total}…
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {submitting
          ? "Adding…"
          : mode === "upload" && pendingFiles.length > 1
            ? `Add ${pendingFiles.length} files`
            : "Add content"}
      </button>
    </form>
  );
}
