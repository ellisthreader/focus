import { addDays, dateKey, parseDateKey } from "./date.mjs";

// A lightweight SM-2 style scheduler used by the interview quiz. Cards are
// graded on a four point scale; harder grades shorten the next interval while
// easy grades stretch it out, so material the user knows well drifts toward
// occasional review and weak material keeps coming back.
// Confidence-Based Repetition, Brainscape style: rate 1-5 how well you knew it.
// Low ratings resurface the card quickly; high ratings space it out. Colours
// run red -> orange -> yellow -> green -> blue (matching Brainscape's scale).
export const RATINGS = Object.freeze([
  { value: 1, key: "1", label: "1", hint: "No idea" },
  { value: 2, key: "2", label: "2", hint: "Barely" },
  { value: 3, key: "3", label: "3", hint: "Some" },
  { value: 4, key: "4", label: "4", hint: "Mostly" },
  { value: 5, key: "5", label: "5", hint: "Nailed it" }
]);

export const MAX_RATING = 5;

const MIN_EASE = 1.3;
const MAX_EASE = 3.2;
const DEFAULT_EASE = 2.5;
const MAX_INTERVAL = 365;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// A card is "mastered" once it has been recalled several times and has settled
// into a multi-week review interval — i.e. it is genuinely in long term memory.
const MASTERY_INTERVAL_DAYS = 14;
const MASTERY_MIN_REPS = 3;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampEase(value) {
  return Math.max(MIN_EASE, Math.min(MAX_EASE, finite(value, DEFAULT_EASE)));
}

function startDate(todayKey) {
  if (DATE_KEY.test(String(todayKey || ""))) {
    try {
      return parseDateKey(todayKey);
    } catch {
      // Fall through to the wall clock.
    }
  }
  return new Date();
}

export function createReview(questionId, topic = "") {
  return {
    questionId: String(questionId || ""),
    topic: String(topic || ""),
    ease: DEFAULT_EASE,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    dueDate: "",
    lastRating: 0,
    lastReviewedAt: null,
    seen: 0,
    correct: 0
  };
}

// Given the current scheduling state for a card and a 1-4 rating, return the
// next scheduling state. Pure and deterministic apart from the review
// timestamp, so it can be unit tested and reused by the reducer and the view.
export function gradeReview(review, rating, todayKey, nowValue) {
  const base = { ...createReview(review?.questionId, review?.topic), ...(review || {}) };
  const grade = Math.max(1, Math.min(MAX_RATING, Math.round(finite(rating))));
  const prevInterval = Math.max(0, finite(base.intervalDays));
  let ease = clampEase(base.ease);
  let reps = Math.max(0, finite(base.reps));
  let lapses = Math.max(0, finite(base.lapses));
  let interval;

  if (grade <= 1) {
    ease = clampEase(ease - 0.2);
    reps = 0;
    lapses += 1;
    interval = 0; // Re-drill in the same session.
  } else if (grade === 2) {
    ease = clampEase(ease - 0.15);
    reps += 1;
    interval = reps <= 1 ? 1 : Math.max(1, Math.round(prevInterval * 1.2));
  } else if (grade === 3) {
    reps += 1;
    if (reps <= 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.max(1, Math.round(prevInterval * ease));
  } else if (grade === 4) {
    ease = clampEase(ease + 0.1);
    reps += 1;
    interval = reps <= 1 ? 3 : Math.max(2, Math.round(prevInterval * ease));
  } else {
    ease = clampEase(ease + 0.15);
    reps += 1;
    interval = reps <= 1 ? 4 : Math.max(3, Math.round(prevInterval * ease * 1.3));
  }
  interval = Math.min(MAX_INTERVAL, Math.max(0, interval));

  return {
    ...base,
    ease,
    reps,
    lapses,
    intervalDays: interval,
    dueDate: dateKey(addDays(startDate(todayKey), interval)),
    lastRating: grade,
    lastReviewedAt: Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now(),
    seen: Math.max(0, finite(base.seen)) + 1,
    correct: Math.max(0, finite(base.correct)) + (grade >= 3 ? 1 : 0)
  };
}

// Preview the interval a given grade would produce, without committing it —
// used to label the rating buttons ("Good · 6d").
export function previewInterval(review, rating, todayKey) {
  return gradeReview(review, rating, todayKey, 0).intervalDays;
}

export function isMastered(review) {
  if (!review) return false;
  return finite(review.intervalDays) >= MASTERY_INTERVAL_DAYS && finite(review.reps) >= MASTERY_MIN_REPS;
}

// A card is due when it has never been scheduled (new) or its due date has
// arrived. New cards are treated as due so they enter rotation immediately.
export function isDue(review, todayKey) {
  if (!review || !review.dueDate) return true;
  return String(review.dueDate) <= String(todayKey || "");
}

export function formatInterval(days) {
  const value = Math.max(0, Math.round(finite(days)));
  if (value <= 0) return "now";
  if (value === 1) return "1d";
  if (value < 30) return `${value}d`;
  const months = Math.round(value / 30);
  return months <= 1 ? "1mo" : `${months}mo`;
}
