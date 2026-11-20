import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from 'ts-fsrs';

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export interface StoredFsrsState {
  due_at?: string | null;
  interval_days?: number | null;
  stability?: number | null;
  difficulty?: number | null;
  fsrs_state?: number | null;
  learning_steps?: number | null;
  reps?: number | null;
  lapses?: number | null;
  last_review_at?: string | null;
}

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 180,
    enable_fuzz: false,
    enable_short_term: true,
  }),
);

export function gradeToRating(grade: ReviewGrade) {
  switch (grade) {
    case 'again':
      return Rating.Again;
    case 'hard':
      return Rating.Hard;
    case 'good':
      return Rating.Good;
    case 'easy':
      return Rating.Easy;
  }
}

export function toFsrsCard(stored: StoredFsrsState, now = new Date()): Card {
  const reps = Number(stored.reps ?? 0);
  const stability = Number(stored.stability ?? 0);
  if (reps === 0 && stability === 0) {
    return createEmptyCard(now);
  }

  const stateNum = Number(stored.fsrs_state ?? State.Review);
  const validState =
    stateNum === State.New ||
    stateNum === State.Learning ||
    stateNum === State.Review ||
    stateNum === State.Relearning
      ? (stateNum as State)
      : State.Review;

  return {
    due: stored.due_at ? new Date(stored.due_at) : now,
    stability: Math.max(0.01, stability),
    difficulty: Math.min(10, Math.max(1, Number(stored.difficulty ?? 5))),
    elapsed_days: 0,
    scheduled_days: Math.max(0, Number(stored.interval_days ?? 0)),
    learning_steps: Math.max(0, Number(stored.learning_steps ?? 0)),
    reps,
    lapses: Math.max(0, Number(stored.lapses ?? 0)),
    state: validState,
    last_review: stored.last_review_at ? new Date(stored.last_review_at) : undefined,
  };
}

export function formatIntervalShort(due: Date, now: Date): string {
  const diffMs = Math.max(60_000, due.getTime() - now.getTime());
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.max(1, Math.round(diffMs / 86_400_000));
  return `${days}d`;
}

export function previewFsrsIntervals(stored: StoredFsrsState, now = new Date()): Record<ReviewGrade, string> {
  const card = toFsrsCard(stored, now);
  const preview = scheduler.repeat(card, now);
  return {
    again: formatIntervalShort(preview[Rating.Again].card.due, now),
    hard: formatIntervalShort(preview[Rating.Hard].card.due, now),
    good: formatIntervalShort(preview[Rating.Good].card.due, now),
    easy: formatIntervalShort(preview[Rating.Easy].card.due, now),
  };
}

export function scheduleFsrsReview(stored: StoredFsrsState, grade: ReviewGrade, now = new Date()) {
  const card = toFsrsCard(stored, now);
  const rating = gradeToRating(grade);
  const result = scheduler.next(card, now, rating);
  const nextCard = result.card;

  const intervalDays = Math.max(
    nextCard.scheduled_days,
    nextCard.due.getTime() - now.getTime() >= 86_400_000
      ? Math.round((nextCard.due.getTime() - now.getTime()) / 86_400_000)
      : 0,
  );

  return {
    due_at: nextCard.due.toISOString(),
    interval_days: intervalDays,
    stability: Number(nextCard.stability.toFixed(4)),
    difficulty: Number(nextCard.difficulty.toFixed(4)),
    fsrs_state: Number(nextCard.state),
    learning_steps: Number(nextCard.learning_steps ?? 0),
    reps: Number(nextCard.reps),
    lapses: Number(nextCard.lapses),
  };
}
