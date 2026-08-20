/**
 * A deliberately small, FSRS-inspired scheduler.  It stores only the state
 * required by a card and derives intervals from stability, difficulty and the
 * actual elapsed interval; UI code never decides a next-review date itself.
 */
export type FsrsCardState = "new" | "learning" | "review" | "relearning";
export type FsrsRating = "again" | "hard" | "good" | "easy";

export interface FsrsScheduleState {
  state: FsrsCardState;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewAt: string;
  dueAt: string;
}

export interface FsrsScheduleResult extends FsrsScheduleState {
  intervalDays: number;
  retrievability: number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function createFsrsState(now = new Date()): FsrsScheduleState {
  return {
    state: "new",
    stability: 0,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    lastReviewAt: "",
    dueAt: now.toISOString()
  };
}

export function scheduleFsrsReview(card: FsrsScheduleState, rating: FsrsRating, now = new Date()): FsrsScheduleResult {
  const previousStability = Math.max(0.1, card.stability || initialStability(rating));
  const elapsedDays = card.lastReviewAt ? Math.max(0, (now.getTime() - new Date(card.lastReviewAt).getTime()) / DAY) : 0;
  const retrievability = clamp(Math.exp(-elapsedDays / previousStability), 0, 1);
  const difficulty = nextDifficulty(card.difficulty || 5, rating, retrievability);
  const reps = Math.max(0, card.reps) + 1;
  const lapses = Math.max(0, card.lapses) + (rating === "again" ? 1 : 0);
  let state: FsrsCardState;
  let stability: number;
  let delayMs: number;

  if (card.state === "new") {
    stability = initialStability(rating);
    if (rating === "again") {
      state = "learning";
      delayMs = 10 * MINUTE;
    } else if (rating === "hard") {
      state = "learning";
      delayMs = Math.max(30 * MINUTE, stability * 0.18 * DAY);
    } else if (rating === "good") {
      state = "review";
      delayMs = stability * 0.9 * DAY;
    } else {
      state = "review";
      delayMs = stability * 1.25 * DAY;
    }
  } else if (rating === "again") {
    state = "relearning";
    stability = Math.max(0.25, previousStability * (0.45 + retrievability * 0.18));
    delayMs = Math.max(10 * MINUTE, Math.min(12 * 60 * MINUTE, stability * 0.15 * DAY));
  } else {
    state = "review";
    const gain = rating === "hard" ? 0.22 : rating === "good" ? 0.72 : 1.08;
    const overdueBonus = 1 + Math.min(0.65, elapsedDays / Math.max(1, previousStability) * 0.14);
    const difficultyFactor = 1.28 - difficulty / 13;
    stability = Math.max(0.3, previousStability * (1 + gain * (1 - retrievability * 0.45) * difficultyFactor * overdueBonus));
    const retentionFactor = rating === "hard" ? 0.55 : rating === "good" ? 0.92 : 1.28;
    delayMs = Math.max(30 * MINUTE, stability * retentionFactor * DAY);
  }

  const due = new Date(now.getTime() + delayMs);
  return {
    state,
    stability: round(stability),
    difficulty: round(difficulty),
    reps,
    lapses,
    lastReviewAt: now.toISOString(),
    dueAt: due.toISOString(),
    intervalDays: round(delayMs / DAY),
    retrievability: round(retrievability)
  };
}

function initialStability(rating: FsrsRating): number {
  return ({ again: 0.35, hard: 0.85, good: 2.2, easy: 4.4 } as const)[rating];
}

function nextDifficulty(previous: number, rating: FsrsRating, retrievability: number): number {
  const ratingShift = ({ again: 1.45, hard: 0.55, good: -0.2, easy: -0.75 } as const)[rating];
  const lapsePressure = retrievability < 0.7 ? 0.25 : -0.08;
  return clamp(previous + ratingShift + lapsePressure, 1, 10);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
