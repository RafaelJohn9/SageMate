"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type GradingResult = { score: number; feedback: string; modelAnswer?: string | null };

type QuestionData = {
  id: string;
  orderIndex: number;
  text: string;
  questionType: "CONCEPTUAL" | "APPLICATION";
  latestAttempt: { answerText: string; grading: GradingResult | null } | null;
};

type HistoryAttempt = {
  id: string;
  answerText: string;
  mode: "IMMEDIATE" | "BATCH";
  submittedAt: string;
  grading: GradingResult | null;
};

function initialAnswers(questions: QuestionData[]) {
  const map: Record<string, string> = {};
  for (const q of questions) {
    if (q.latestAttempt) map[q.id] = q.latestAttempt.answerText;
  }
  return map;
}

function initialResults(questions: QuestionData[]) {
  const map: Record<string, GradingResult | null> = {};
  for (const q of questions) {
    if (q.latestAttempt?.grading) map[q.id] = q.latestAttempt.grading;
  }
  return map;
}

export function AnsweringPanel({ questions, setId }: { questions: QuestionData[]; setId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"immediate" | "batch">("immediate");
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers(questions));
  const [results, setResults] = useState<Record<string, GradingResult | null>>(() => initialResults(questions));
  const [gradingErrors, setGradingErrors] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryAttempt[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function toggleHistory(questionId: string) {
    if (historyOpenId === questionId) {
      setHistoryOpenId(null);
      return;
    }
    setHistoryOpenId(questionId);
    if (!history[questionId]) {
      setHistoryLoading(true);
      const res = await fetch(`/api/questions/${questionId}/attempts`);
      setHistoryLoading(false);
      if (res.ok) {
        const body = await res.json();
        setHistory((prev) => ({ ...prev, [questionId]: body.attempts }));
      }
    }
  }

  async function submitImmediate(questionId: string) {
    const answerText = (answers[questionId] ?? "").trim();
    if (!answerText) {
      setError("Write an answer before submitting.");
      return;
    }
    setError(null);
    setSubmittingId(questionId);
    setResults((prev) => ({ ...prev, [questionId]: null }));
    setGradingErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });

    const res = await fetch(`/api/questions/${questionId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerText }),
    });
    setSubmittingId(null);

    if (!res.ok) {
      setError("Could not save your answer.");
      return;
    }
    const body = await res.json();
    if (body.attempt?.grading) {
      setResults((prev) => ({ ...prev, [questionId]: body.attempt.grading }));
    } else if (body.gradingError) {
      setGradingErrors((prev) => ({ ...prev, [questionId]: body.gradingError }));
    }
    setHistory((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    router.refresh();
  }

  async function submitBatch() {
    const payload = questions
      .map((q) => ({ questionId: q.id, answerText: (answers[q.id] ?? "").trim() }))
      .filter((a) => a.answerText.length > 0);

    if (payload.length === 0) {
      setError("Answer at least one question before submitting.");
      return;
    }
    setError(null);
    setBatchSubmitting(true);
    const res = await fetch(`/api/question-sets/${setId}/attempts/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });
    setBatchSubmitting(false);

    if (!res.ok) {
      setError("Could not submit your answers.");
      return;
    }
    const body = await res.json();
    const nextResults: Record<string, GradingResult | null> = {};
    for (const attempt of body.attempts ?? []) {
      nextResults[attempt.questionId] = attempt.grading ?? null;
    }
    setResults((prev) => ({ ...prev, ...nextResults }));
    setHistory({});
    if (body.gradingError) {
      setError(body.gradingError);
    }
    setBatchDone(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("immediate")}
          className={`rounded-md px-3 py-1.5 ${mode === "immediate" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}
        >
          Answer & grade one at a time
        </button>
        <button
          type="button"
          onClick={() => setMode("batch")}
          className={`rounded-md px-3 py-1.5 ${mode === "batch" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}
        >
          Answer all, then grade
        </button>
      </div>

      <ol className="flex flex-col gap-3">
        {questions.map((q) => {
          const result = results[q.id];
          const gradingError = gradingErrors[q.id];
          const questionHistory = history[q.id];
          return (
            <li key={q.id} className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium text-zinc-500">Q{q.orderIndex + 1}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    q.questionType === "APPLICATION"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {q.questionType === "APPLICATION" ? "Application" : "Conceptual"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleHistory(q.id)}
                  className="ml-auto text-xs text-zinc-400 hover:underline"
                >
                  {historyOpenId === q.id ? "Hide history" : "History"}
                </button>
              </div>
              <p className="mb-3">{q.text}</p>
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="Write your answer…"
                rows={4}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              {mode === "immediate" && (
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => submitImmediate(q.id)}
                    disabled={submittingId === q.id}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {submittingId === q.id ? "Grading…" : result ? "Submit again (retry)" : "Submit answer"}
                  </button>
                </div>
              )}
              {result && (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                  <p className="font-medium text-emerald-800 dark:text-emerald-300">Score: {result.score}/100</p>
                  <p className="mt-1 text-zinc-700 dark:text-zinc-300">{result.feedback}</p>
                  {result.modelAnswer && (
                    <p className="mt-2 text-zinc-500">
                      <span className="font-medium">Model answer: </span>
                      {result.modelAnswer}
                    </p>
                  )}
                </div>
              )}
              {gradingError && <p className="mt-2 text-xs text-red-600">{gradingError}</p>}

              {historyOpenId === q.id && (
                <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  {historyLoading && !questionHistory && <p className="text-xs text-zinc-400">Loading…</p>}
                  {questionHistory?.length === 0 && (
                    <p className="text-xs text-zinc-400">No previous attempts.</p>
                  )}
                  {questionHistory?.map((attempt) => (
                    <div key={attempt.id} className="rounded-md bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
                      <p className="text-zinc-400">
                        {new Date(attempt.submittedAt).toLocaleString()} · {attempt.mode.toLowerCase()}
                        {attempt.grading ? ` · ${attempt.grading.score}/100` : ""}
                      </p>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{attempt.answerText}</p>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {mode === "batch" && (
        <button
          type="button"
          onClick={submitBatch}
          disabled={batchSubmitting}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {batchSubmitting ? "Grading…" : "Submit all answers"}
        </button>
      )}
      {batchDone && <p className="text-sm text-emerald-600">All answers graded above.</p>}
    </div>
  );
}
