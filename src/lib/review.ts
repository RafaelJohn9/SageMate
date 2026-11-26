import { db } from "@/lib/db";
import { nextReviewState, type ReviewResult } from "@/lib/spacedRepetition";
import { dayToDate } from "@/lib/studyPlan";

// Applies one review result to a question's schedule. Scheduling is secondary to grading, so this
// never throws: a failure here must not turn a successfully graded answer into an error response.
export async function recordReview(questionId: string, result: ReviewResult, reviewedAt: Date): Promise<void> {
  try {
    const question = await db.question.findUnique({
      where: { id: questionId },
      select: {
        box: true,
        dueAt: true,
        lastReviewedAt: true,
        lastResult: true,
        // The unit's study plan, if any, sets the date everything must be reviewed by.
        questionSet: { select: { unit: { select: { studyTrack: { select: { endDate: true } } } } } },
      },
    });
    if (!question) return;

    const endDate = question.questionSet?.unit?.studyTrack?.endDate;
    const next = nextReviewState(question, result, reviewedAt, endDate ? dayToDate(endDate) : null);
    await db.question.update({
      where: { id: questionId },
      data: {
        box: next.box,
        dueAt: next.dueAt,
        lastReviewedAt: next.lastReviewedAt,
        lastResult: next.lastResult,
      },
    });
  } catch (err) {
    console.error(`Could not update the review schedule for question ${questionId}:`, err);
  }
}
