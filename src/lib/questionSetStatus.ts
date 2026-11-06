export type QuestionSetStatus = "PENDING" | "COMPLETED" | "FAILED";

// Generation runs in the server process, so a restart mid-run leaves a set PENDING forever.
// Past this age a pending set is treated as failed rather than spinning indefinitely.
export const STALE_PENDING_MS = 15 * 60 * 1000;

export const INTERRUPTED_MESSAGE = "Generation was interrupted before it finished. Try creating the set again.";

export function effectiveStatus(
  status: QuestionSetStatus,
  createdAt: Date,
  now: Date = new Date(),
): QuestionSetStatus {
  if (status === "PENDING" && now.getTime() - createdAt.getTime() > STALE_PENDING_MS) return "FAILED";
  return status;
}
