// Choosing the questions for one morning. Pure: the database work lives in src/lib/morningSession.ts.
//
// Three things pull against each other and the order below settles them:
//   1. Spread: the session must touch at least `minUnits` units when that many have anything to ask.
//      Mixing units in one sitting (interleaving) is itself a memory aid.
//   2. New material: a share of the session is kept for questions on what was read most recently, so a
//      backlog of reviews cannot starve it.
//   3. Reviews: everything else goes to questions that are due, most urgent first.
// If slots are still free, questions that are not due yet fill them, so the morning is never short.

export type PickReason = "due" | "new" | "early";

/** One unit's candidates, each list already in priority order (best first). */
export type UnitCandidates = {
  unitId: string;
  due: string[];
  fresh: string[];
  early: string[];
};

export type SessionPick = { questionId: string; unitId: string; reason: PickReason };

/** The share of a session reserved for never-asked questions, when there are any. */
export const NEW_SHARE = 0.4;

type Tier = "due" | "fresh" | "early";
const REASON: Record<Tier, PickReason> = { due: "due", fresh: "new", early: "early" };

export function composeSession(
  units: UnitCandidates[],
  { count, minUnits }: { count: number; minUnits: number },
): SessionPick[] {
  const queues = units.map((u) => ({
    unitId: u.unitId,
    due: [...u.due],
    fresh: [...u.fresh],
    early: [...u.early],
    picked: 0,
  }));
  type Queue = (typeof queues)[number];

  const picks: SessionPick[] = [];
  const maxNew = Math.ceil(count * NEW_SHARE);
  let newCount = 0;
  const full = () => picks.length >= count;

  const take = (queue: Queue, tier: Tier) => {
    const questionId = queue[tier].shift();
    if (questionId === undefined) return;
    picks.push({ questionId, unitId: queue.unitId, reason: REASON[tier] });
    queue.picked++;
    if (tier === "fresh") newCount++;
  };

  // 1. Spread: one question from each of the most pressing units.
  const byUrgency = [...queues].sort(
    (a, b) => b.due.length - a.due.length || b.fresh.length - a.fresh.length || b.early.length - a.early.length,
  );
  let spread = 0;
  for (const queue of byUrgency) {
    if (full() || spread >= minUnits) break;
    const tier: Tier | null = queue.due.length
      ? "due"
      : queue.fresh.length
        ? "fresh"
        : queue.early.length
          ? "early"
          : null;
    if (!tier) continue;
    take(queue, tier);
    spread++;
  }

  // Deal one at a time to the units with the fewest questions so far, so no unit hogs the session.
  const deal = (tier: Tier, allowed: () => boolean = () => true) => {
    for (;;) {
      const queue = queues
        .filter((q) => q[tier].length > 0)
        .sort((a, b) => a.picked - b.picked || b[tier].length - a[tier].length)[0];
      if (!queue || full() || !allowed()) return;
      take(queue, tier);
    }
  };

  deal("fresh", () => newCount < maxNew); // 2. the reserved share of new material
  deal("due"); // 3. reviews that are due
  deal("fresh"); // 4. more new material, if reviews ran out
  deal("early"); //    then reviews ahead of schedule

  return interleave(picks);
}

/** Orders the picks so that, where possible, no two questions in a row come from the same unit. */
export function interleave(picks: SessionPick[]): SessionPick[] {
  const groups = new Map<string, SessionPick[]>();
  for (const pick of picks) {
    const group = groups.get(pick.unitId) ?? [];
    group.push(pick);
    groups.set(pick.unitId, group);
  }

  const ordered: SessionPick[] = [];
  let lastUnit: string | null = null;
  while (ordered.length < picks.length) {
    const remaining = [...groups.values()].filter((g) => g.length > 0).sort((a, b) => b.length - a.length);
    const group = remaining.find((g) => g[0].unitId !== lastUnit) ?? remaining[0];
    const next = group.shift()!;
    ordered.push(next);
    lastUnit = next.unitId;
  }
  return ordered;
}

/** Mornings in a row with at least one answered question, counting back from today (or yesterday). */
export function countStreak(answeredDays: string[], today: string, previousDay: (day: string) => string): number {
  const days = new Set(answeredDays);
  let cursor = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  return streak;
}
