"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type FormEvent } from "react";

const PURPOSE_PRESETS = ["GENERAL", "CAT1", "CAT2", "EXAM"];

function titleFromFilename(filename: string): string {
  return filename.replace(/\.(pdf|docx)$/i, "").replace(/[-_]+/g, " ").trim();
}

type PendingFile = { file: File; title: string };

export function AddContentForm({ unitId }: { unitId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [title, setTitle] = useState("");
  const [contentKind, setContentKind] = useState<"NOTES" | "PAST_PAPER">("NOTES");
  const [purpose, setPurpose] = useState("GENERAL");
  const [customPurpose, setCustomPurpose] = useState("");
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const resolvedPurpose = purpose === "CUSTOM" ? customPurpose.trim() : purpose;

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const additions = Array.from(fileList)
      .filter((file) => /\.(pdf|docx)$/i.test(file.name))
      .map((file) => ({ file, title: titleFromFilename(file.name) }));
    setPendingFiles((prev) => [...prev, ...additions]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function renamePendingFile(index: number, newTitle: string) {
    setPendingFiles((prev) => prev.map((p, i) => (i === index ? { ...p, title: newTitle } : p)));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded-md px-3 py-1.5 transition-colors ${mode === "paste" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
        >
          Paste text
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-md px-3 py-1.5 transition-colors ${mode === "upload" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
        >
          Upload PDF/DOCX
        </button>
      </div>

      {mode === "paste" && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Lecture 3 notes, CAT 1 2025 paper)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Kind</span>
          <select
            value={contentKind}
            onChange={(e) => setContentKind(e.target.value as "NOTES" | "PAST_PAPER")}
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="NOTES">Notes / assignment</option>
            <option value="PAST_PAPER">Past CAT/exam paper</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">Purpose</span>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1"
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
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        )}
      </div>

      {mode === "paste" ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste notes, assignment, or past paper text here…"
          rows={10}
          className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-muted-foreground"
            >
              <path d="M12 16V4m0 0L7 9m5-5l5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm">
              <span className="font-medium text-primary">Click to browse</span>{" "}
              <span className="text-muted-foreground">or drag PDF/DOCX files here</span>
            </p>
            <p className="text-xs text-muted-foreground">Kind and purpose above apply to all selected files.</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
          </div>

          {pendingFiles.length > 0 && (
            <ul className="flex flex-col gap-2">
              {pendingFiles.map((p, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                  <input
                    value={p.title}
                    onChange={(e) => renamePendingFile(i, e.target.value)}
                    className="flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm focus:border-border focus:outline-none"
                  />
                  <span className="text-xs text-muted-foreground">{p.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    className="text-xs text-danger hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {progress && (
        <p className="text-sm text-muted-foreground">
          Uploading {progress.done}/{progress.total}…
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
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
