"use client";

import { useMemo, useState, useSyncExternalStore, type ComponentProps } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { AnsweringPanel } from "./AnsweringPanel";

type AnsweringQuestion = ComponentProps<typeof AnsweringPanel>["questions"][number];

export type RevisionQuestion = AnsweringQuestion & { answer: string | null };

type Confidence = "known" | "review";
type View = "study" | "test";
type Filter = "all" | "review";

function storageKey(setId: string) {
  return `sagemate:revision:${setId}`;
}

// "Known / review again" marks are a per-browser study aid, kept in localStorage. If storage is
// unavailable (private window etc.) they live in memory for the session instead.
const memoryFallback = new Map<string, string>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parseConfidence(raw: string | null): Record<string, Confidence> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function RevisionPanel({ setId, questions }: { setId: string; questions: RevisionQuestion[] }) {
  const [view, setView] = useState<View>("study");
  const [filter, setFilter] = useState<Filter>("all");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const key = storageKey(setId);
  const rawConfidence = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const confidence = useMemo(() => parseConfidence(rawConfidence), [rawConfidence]);

  function mark(questionId: string, value: Confidence) {
    const next = { ...confidence };
    if (next[questionId] === value) delete next[questionId];
    else next[questionId] = value;
    writeRaw(key, JSON.stringify(next));
  }

  const knownCount = questions.filter((q) => confidence[q.id] === "known").length;
  const allRevealed = questions.length > 0 && questions.every((q) => revealed[q.id]);
  const visible = filter === "review" ? questions.filter((q) => confidence[q.id] !== "known") : questions;

  function toggleAll() {
    if (allRevealed) {
      setRevealed({});
    } else {
      setRevealed(Object.fromEntries(questions.map((q) => [q.id, true])));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Revision mode" className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["study", "Study with answers"],
            ["test", "Test yourself"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={`rounded-md px-3 py-1.5 ${focusRing} ${
              view === value ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "test" ? (
        <AnsweringPanel setId={setId} questions={questions} />
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-2 flex flex-col gap-2 bg-background/95 px-2 py-2 backdrop-blur">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <p className="text-foreground">
                <span className="font-semibold tabular-nums">{knownCount}</span>
                <span className="text-muted-foreground"> of {questions.length} known</span>
              </p>
              <div className="ml-auto flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setFilter(filter === "all" ? "review" : "all")}
                  aria-pressed={filter === "review"}
                  className={`rounded-md border px-2.5 py-1 ${focusRing} ${
                    filter === "review"
                      ? "border-mark bg-mark-tint text-mark"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  Hide ones I know
                </button>
                <button
                  type="button"
                  onClick={toggleAll}
                  className={`rounded-md border border-border px-2.5 py-1 text-muted-foreground ${focusRing}`}
                >
                  {allRevealed ? "Hide all answers" : "Show all answers"}
                </button>
              </div>
            </div>
            <div
              className="h-1 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-label="Questions known"
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={knownCount}
            >
              <div
                className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${questions.length ? (knownCount / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {visible.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              You&rsquo;ve marked every question as known. Turn off &ldquo;Hide ones I know&rdquo; to go through
              them again, or switch to &ldquo;Test yourself&rdquo; and write your answers out.
            </p>
          )}

          <ol className="flex flex-col gap-3">
            {visible.map((q) => {
              const isOpen = !!revealed[q.id];
              const state = confidence[q.id];
              const answerId = `answer-${q.id}`;
              return (
                <li
                  key={q.id}
                  className={`rounded-lg border bg-card text-sm ${
                    state === "known" ? "border-success/40" : state === "review" ? "border-mark/50" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setRevealed((prev) => ({ ...prev, [q.id]: !isOpen }))}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    className={`flex w-full min-w-0 flex-col gap-2 rounded-lg p-4 text-left ${focusRing}`}
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-muted-foreground">Q{q.orderIndex + 1}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          q.questionType === "APPLICATION"
                            ? "bg-mark-tint text-mark"
                            : "bg-border/50 text-muted-foreground"
                        }`}
                      >
                        {q.questionType === "APPLICATION" ? "Application" : "Conceptual"}
                      </span>
                      {q.marks != null && <span className="text-xs text-muted-foreground">{q.marks} marks</span>}
                      <span className="ml-auto text-xs text-primary">{isOpen ? "Hide answer" : "Show answer"}</span>
                    </span>
                    <span className="font-serif text-base leading-relaxed break-words text-foreground">{q.text}</span>
                  </button>

                  <div
                    id={answerId}
                    className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden" inert={!isOpen}>
                      <div className="mx-4 mb-4 border-t border-border pt-3">
                        <div className="border-l-2 border-mark pl-3 leading-relaxed text-foreground">
                          {q.answer ? (
                            <Markdown>{q.answer}</Markdown>
                          ) : (
                            <p className="text-muted-foreground">No answer was saved for this question.</p>
                          )}
                        </div>
                        {q.markingScheme && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Marking scheme: </span>
                            {q.markingScheme}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => mark(q.id, "known")}
                            aria-pressed={state === "known"}
                            className={`rounded-md border px-3 py-1.5 font-medium ${focusRing} ${
                              state === "known"
                                ? "border-success bg-success text-success-foreground"
                                : "border-success/50 text-success"
                            }`}
                          >
                            I knew this
                          </button>
                          <button
                            type="button"
                            onClick={() => mark(q.id, "review")}
                            aria-pressed={state === "review"}
                            className={`rounded-md border px-3 py-1.5 font-medium ${focusRing} ${
                              state === "review"
                                ? "border-mark bg-mark text-mark-foreground"
                                : "border-mark/50 text-mark"
                            }`}
                          >
                            Review again
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
