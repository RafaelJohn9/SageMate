// Progress for a unit's practice question sets, derived from each question's latest attempt.

export type PracticeSetInput = {
  questions: { attempts: { grading: { score: number } | null }[] }[];
};

export type UnitProgress = {
  total: number;
  answered: number;
  graded: number;
  /** Mean of the latest graded score per question (0-100), or null if nothing is graded yet. */
  averageScore: number | null;
};

export function summarizeUnit(sets: PracticeSetInput[]): UnitProgress {
  let total = 0;
  let answered = 0;
  const scores: number[] = [];

  for (const set of sets) {
    for (const question of set.questions) {
      total++;
      const latest = question.attempts[0];
      if (!latest) continue;
      answered++;
      if (latest.grading) scores.push(latest.grading.score);
    }
  }

  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : null;
  return { total, answered, graded: scores.length, averageScore };
}
