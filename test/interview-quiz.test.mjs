import test from "node:test";
import assert from "node:assert/strict";

import {
  RATINGS,
  createReview,
  gradeReview,
  isDue,
  isMastered,
  previewInterval
} from "../src/core/spaced-repetition.mjs";
import { QUIZ_QUESTIONS, QUIZ_TOPICS } from "../src/features/interview-quiz-bank.mjs";
import { buildScorecard, dueCount, buildOrder, render } from "../src/features/interview-quiz.mjs";
import { reduceAppState } from "../src/core/reducer.mjs";
import { createDefaultState, normalizeState } from "../src/core/schema.mjs";

const TODAY = "2026-06-24";
const CTX = { todayKey: TODAY };

test("question bank is well formed", () => {
  assert.ok(QUIZ_QUESTIONS.length >= 100, "expected a large question bank");
  const topicKeys = new Set(QUIZ_TOPICS.map((topic) => topic.key));
  const ids = new Set();
  for (const question of QUIZ_QUESTIONS) {
    assert.ok(!ids.has(question.id), `duplicate id ${question.id}`);
    ids.add(question.id);
    assert.ok(topicKeys.has(question.topic), `unknown topic ${question.topic}`);
    assert.ok(question.prompt.trim().length > 0, `empty prompt ${question.id}`);
    assert.ok(question.answer.trim().length > 0, `empty answer ${question.id}`);
  }
  // Every topic should have at least a few cards so the filter is useful.
  for (const topic of QUIZ_TOPICS) {
    const count = QUIZ_QUESTIONS.filter((q) => q.topic === topic.key).length;
    assert.ok(count >= 5, `topic ${topic.key} only has ${count} cards`);
  }
});

test("new cards are due immediately", () => {
  assert.equal(isDue(undefined, TODAY), true);
  assert.equal(isDue(createReview("x"), TODAY), true);
});

test("a 'good' grade graduates the interval upward", () => {
  let review = createReview("q1", "mlops");
  review = gradeReview(review, 3, TODAY, 1000);
  assert.equal(review.intervalDays, 1);
  assert.equal(review.reps, 1);
  assert.equal(review.correct, 1);
  assert.equal(review.seen, 1);
  assert.equal(isDue(review, TODAY), false, "should now be scheduled forward");

  review = gradeReview(review, 3, review.dueDate, 2000);
  assert.equal(review.intervalDays, 3);
  review = gradeReview(review, 3, review.dueDate, 3000);
  assert.ok(review.intervalDays > 3, "third good grade multiplies by ease");
});

test("'again' resets reps, records a lapse, and re-drills the same day", () => {
  let review = gradeReview(createReview("q2"), 3, TODAY, 1);
  review = gradeReview(review, 3, review.dueDate, 2);
  review = gradeReview(review, 1, TODAY, 3);
  assert.equal(review.reps, 0);
  assert.equal(review.lapses, 1);
  assert.equal(review.intervalDays, 0);
  assert.equal(isDue(review, TODAY), true, "lapsed card is due again today");
  assert.equal(review.correct, 2, "an 'again' does not count as correct");
});

test("ease stays within bounds and 'easy' grows fastest", () => {
  let review = createReview("q3");
  for (let i = 0; i < 10; i += 1) {
    review = gradeReview(review, 1, TODAY, i);
  }
  assert.ok(review.ease >= 1.3, "ease floored at 1.3");

  let easy = createReview("q4");
  easy = gradeReview(easy, 4, TODAY, 1);
  assert.equal(easy.intervalDays, 3, "first easy grade jumps to 3 days");
});

test("previewInterval matches what a grade would commit", () => {
  const review = createReview("q5");
  for (const rating of RATINGS) {
    const preview = previewInterval(review, rating.value, TODAY);
    const committed = gradeReview(review, rating.value, TODAY, 0).intervalDays;
    assert.equal(preview, committed);
  }
});

test("mastery requires repeated recall and a multi-week interval", () => {
  let review = createReview("q6");
  assert.equal(isMastered(review), false);
  for (let i = 0; i < 6; i += 1) {
    review = gradeReview(review, 4, review.dueDate || TODAY, i);
  }
  assert.equal(isMastered(review), true, "consistently easy card becomes mastered");
});

test("grading through the reducer updates reviews, daily tally and scorecard", () => {
  let state = createDefaultState();
  const startDue = dueCount(state, CTX);
  assert.equal(startDue, QUIZ_QUESTIONS.length, "every card starts due");

  const question = QUIZ_QUESTIONS[0];
  state = reduceAppState(state, {
    type: "quizReview/grade",
    payload: { questionId: question.id, topic: question.topic, rating: 3, today: TODAY }
  });

  assert.equal(state.quizReviews.length, 1);
  assert.equal(state.quizReviews[0].questionId, question.id);
  assert.equal(state.quizDaily[TODAY].reviewed, 1);
  assert.equal(state.quizDaily[TODAY].correct, 1);
  assert.equal(dueCount(state, CTX), startDue - 1, "graded card is no longer due");

  const card = buildScorecard(state, CTX);
  assert.equal(card.reviewedToday, 1);
  assert.equal(card.streak, 1);
  assert.equal(card.accuracy, 100);
  assert.equal(card.dueToday, startDue - 1);
});

test("an 'again' grade keeps the card due and counts as incorrect", () => {
  let state = createDefaultState();
  const question = QUIZ_QUESTIONS[0];
  state = reduceAppState(state, {
    type: "quizReview/grade",
    payload: { questionId: question.id, topic: question.topic, rating: 1, today: TODAY }
  });
  assert.equal(state.quizDaily[TODAY].reviewed, 1);
  assert.equal(state.quizDaily[TODAY].correct, 0);
  assert.equal(dueCount(state, CTX), QUIZ_QUESTIONS.length, "lapsed card stays due");
});

test("quiz/reset clears all progress", () => {
  let state = createDefaultState();
  state = reduceAppState(state, {
    type: "quizReview/grade",
    payload: { questionId: QUIZ_QUESTIONS[0].id, rating: 4, today: TODAY }
  });
  state = reduceAppState(state, { type: "quiz/reset", payload: {} });
  assert.equal(state.quizReviews.length, 0);
  assert.deepEqual(state.quizDaily, {});
});

test("buildOrder produces the right queue per source", () => {
  const state = createDefaultState();
  const ctx = CTX;
  const deck = buildOrder(state, ctx, { source: "deck", topic: "azure-ml" });
  assert.ok(deck.length >= 5, "deck pulls that topic's cards");
  assert.ok(deck.every((id) => QUIZ_QUESTIONS.find((q) => q.id === id)?.topic === "azure-ml"));

  const due = buildOrder(state, ctx, { source: "due" });
  assert.ok(due.length > 0, "all cards are due on a fresh state");

  const mock = buildOrder(state, ctx, { source: "mock" });
  assert.equal(mock.length, 10, "sessions are capped at 10 cards");
  assert.equal(new Set(mock).size, 10, "mock has no duplicates");

  assert.ok(deck.length <= 10, "deck rounds are capped at 10");
  assert.ok(due.length <= 10, "due rounds are capped at 10");
});

test("the deck browser renders decks and mastery", () => {
  const html = render(createDefaultState(), CTX);
  assert.match(html, /class="quiz-deck-grid"/);
  assert.match(html, /Azure ML Platform/);
  assert.match(html, /mastered/);
});

test("a study session runs through flip + confidence rating to a summary", () => {
  let state = createDefaultState();
  const order = buildOrder(state, CTX, { source: "mock" }).slice(0, 5);

  state = reduceAppState(state, {
    type: "quiz/start",
    payload: { source: "mock", label: "Mock interview", order, now: 1000 }
  });
  assert.equal(state.ui.quizSession.order.length, 5);

  // Active session renders the focused study screen with a flip card.
  let html = render(state, { ...CTX, now: new Date("2026-06-24T09:00:00Z") });
  assert.match(html, /quiz-flashcard/);
  assert.match(html, /1 \/ 5/);

  for (let i = 0; i < 5; i += 1) {
    state = reduceAppState(state, {
      type: "quiz/answer",
      payload: { questionId: order[i], rating: i === 0 ? 1 : 5, today: TODAY, now: 2000 + i }
    });
  }
  assert.equal(state.ui.quizSession.index, 5);
  assert.ok(state.ui.quizSession.finishedAt, "session marks a finish time");
  assert.equal(state.ui.quizSession.results.length, 5);
  assert.equal(state.quizReviews.length, 5, "answering updates spaced-repetition progress");

  html = render(state, CTX);
  assert.match(html, /Round complete/);
});

test("revision time accumulates per answer and shows on the scorecard", () => {
  let state = createDefaultState();
  const order = buildOrder(state, CTX, { source: "mock" }).slice(0, 3);
  const t0 = 1_700_000_000_000; // a realistic ms timestamp
  state = reduceAppState(state, { type: "quiz/start", payload: { source: "mock", order, now: t0 } });

  // Three answers at +10s, +20s, then a long gap that should be capped at 180s.
  state = reduceAppState(state, { type: "quiz/answer", payload: { questionId: order[0], rating: 4, today: TODAY, now: t0 + 10_000 } });
  state = reduceAppState(state, { type: "quiz/answer", payload: { questionId: order[1], rating: 4, today: TODAY, now: t0 + 30_000 } });
  state = reduceAppState(state, { type: "quiz/answer", payload: { questionId: order[2], rating: 4, today: TODAY, now: t0 + 30_000 + 999_000 } });

  // 10 + 20 + capped 180 = 210 seconds.
  assert.equal(state.quizDaily[TODAY].seconds, 210);

  const card = buildScorecard(state, CTX);
  assert.equal(card.secondsToday, 210);
  assert.equal(card.secondsTotal, 210);

  const html = render(reduceAppState(state, { type: "quiz/exit", payload: {} }), CTX);
  assert.match(html, /Total time/);
  assert.match(html, /3m/); // 210s = 3m 30s -> "3m"
});

test("opening a deck shows its cards and the rating scale", () => {
  let state = createDefaultState();
  state = reduceAppState(state, { type: "ui/setQuizDeck", payload: { deck: "azure-ml" } });
  const html = render(state, CTX);
  assert.match(html, /quiz-deck-detail/);
  assert.match(html, /Rating scale/);
  assert.match(html, /quiz-cardlist/);
  assert.match(html, /Study this deck/);
  // Lists the deck's actual questions.
  const azureCards = QUIZ_QUESTIONS.filter((q) => q.topic === "azure-ml");
  assert.ok(azureCards.length > 0);
  assert.ok(html.includes(azureCards[0].prompt.replace(/"/g, "&quot;").replace(/'/g, "&#039;")));
});

test("closing a deck returns to the browser", () => {
  let state = createDefaultState();
  state = reduceAppState(state, { type: "ui/setQuizDeck", payload: { deck: "mlops" } });
  state = reduceAppState(state, { type: "ui/setQuizDeck", payload: { deck: "" } });
  assert.match(render(state, CTX), /class="quiz-deck-grid"/);
});

test("quiz/exit returns to the deck browser", () => {
  let state = createDefaultState();
  state = reduceAppState(state, {
    type: "quiz/start",
    payload: { source: "deck", order: buildOrder(state, CTX, { source: "deck", topic: "mlops" }) }
  });
  state = reduceAppState(state, { type: "quiz/exit", payload: {} });
  assert.equal(state.ui.quizSession, null);
  const html = render(state, CTX);
  assert.match(html, /class="quiz-deck-grid"/, "falls back to the deck browser");
});

test("quiz state survives normalization round-trip", () => {
  let state = createDefaultState();
  state = reduceAppState(state, {
    type: "quizReview/grade",
    payload: { questionId: QUIZ_QUESTIONS[0].id, topic: QUIZ_QUESTIONS[0].topic, rating: 5, today: TODAY }
  });
  state = reduceAppState(state, {
    type: "quiz/start",
    payload: { source: "deck", deck: "azure-ml", label: "Azure ML Platform", order: buildOrder(state, CTX, { source: "deck", topic: "azure-ml" }) }
  });
  const round = normalizeState(state);
  assert.equal(round.quizReviews.length, 1);
  assert.equal(round.quizReviews[0].questionId, QUIZ_QUESTIONS[0].id);
  assert.equal(round.quizDaily[TODAY].reviewed, 1);
  assert.equal(round.ui.quizSession.deck, "azure-ml");
});
