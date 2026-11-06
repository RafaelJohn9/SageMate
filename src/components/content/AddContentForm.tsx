"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
import {
  buttonPrimary,
  FormError,
  FormSection,
  inputClass,
  Segmented,
} from "@/components/ui/form";
import { formatCharCount } from "@/lib/formatting";

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

  function handleDrop(event: DragEvent<HTMLElement>) {
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
    <form onSubmit={handleSubmit} className="border-t border-border" noValidate>
      <FormSection title="Add it by" hint="Paste text straight in, or upload PDF and Word files.">
        <Segmented
          name="mode"
          label="How to add content"
          value={mode}
          onChange={setMode}
          options={[
            { value: "paste", label: "Pasting text" },
            { value: "upload", label: "Uploading files" },
          ]}
        />
      </FormSection>

      {mode === "paste" && (
        <FormSection title="Title" htmlFor="content-title">
          <input
            id="content-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lecture 3 notes, CAT 1 2025 paper"
            className={inputClass}
          />
        </FormSection>
      )}

      <FormSection
        title="Kind"
        hint="Past papers teach SageMate how your lecturer phrases questions. Notes are the material to learn."
      >
        <Segmented
          name="kind"
          label="Kind of content"
          value={contentKind}
          onChange={setContentKind}
          options={[
            { value: "NOTES", label: "Notes or assignment" },
            { value: "PAST_PAPER", label: "Past CAT or exam paper" },
          ]}
        />
      </FormSection>

      <FormSection title="Purpose" hint="Which test is this for? You can filter by it when generating questions.">
        <div className="flex flex-col gap-3">
          <Segmented
            name="purpose"
            label="Purpose"
            value={purpose}
            onChange={setPurpose}
            options={[
              ...PURPOSE_PRESETS.map((p) => ({ value: p, label: p })),
              { value: "CUSTOM", label: "Something else" },
            ]}
          />
          {purpose === "CUSTOM" && (
            <input
              value={customPurpose}
              onChange={(e) => setCustomPurpose(e.target.value)}
              placeholder="e.g. CAT3"
              aria-label="Custom purpose"
              className={`${inputClass} sm:w-56`}
            />
          )}
        </div>
      </FormSection>

      <FormSection
        title={mode === "paste" ? "Text" : "Files"}
        htmlFor={mode === "paste" ? "content-text" : undefined}
        hint={mode === "upload" ? "Kind and purpose apply to every file you add." : undefined}
      >
        {mode === "paste" ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              id="content-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your notes, assignment or past paper here…"
              rows={12}
              className={`${inputClass} leading-relaxed`}
            />
            <p className="text-xs text-muted-foreground">
              {text.trim() ? formatCharCount(text.trim().length) : "Nothing pasted yet."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed px-6 py-9 text-center transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${
                dragActive ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/60"
              }`}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
                className="text-muted-foreground"
              >
                <path d="M12 16V4m0 0L7 9m5-5l5 5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm">
                <span className="font-medium text-primary">Choose files</span>{" "}
                <span className="text-muted-foreground">or drop PDF and Word files here</span>
              </span>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </label>

            {pendingFiles.length > 0 && (
              <ul className="border-t border-border">
                {pendingFiles.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2">
                    <input
                      value={p.title}
                      onChange={(e) => renamePendingFile(i, e.target.value)}
                      aria-label={`Title for ${p.file.name}`}
                      className="min-w-0 flex-1 basis-48 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-border"
                    />
                    <span className="max-w-48 truncate text-xs text-muted-foreground">{p.file.name}</span>
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
      </FormSection>

      <div className="flex flex-col gap-3 py-5">
        {error && <FormError>{error}</FormError>}
        {progress && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Uploading {progress.done} of {progress.total}…
          </p>
        )}
        <div>
          <button type="submit" disabled={submitting} className={buttonPrimary}>
            {submitting
              ? "Adding…"
              : mode === "upload" && pendingFiles.length > 1
                ? `Add ${pendingFiles.length} files`
                : "Add content"}
          </button>
        </div>
      </div>
    </form>
  );
}
