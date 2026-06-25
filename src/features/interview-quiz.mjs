import { addDays, dateKey, parseDateKey } from "../core/date.mjs";
import {
  RATINGS,
  createReview,
  isDue,
  isMastered
} from "../core/spaced-repetition.mjs";
import { QUIZ_QUESTIONS, QUIZ_TOPICS, topicLabel } from "./interview-quiz-bank.mjs";
import { attachGlossary } from "../ui/glossary.mjs";

const bindings = new WeakMap();
// Brainscape studies in small rounds; we cap every session at 10 cards.
const SESSION_SIZE = 10;

const QUESTION_BY_ID = new Map(QUIZ_QUESTIONS.map((question) => [question.id, question]));

// render() runs immediately before bind() on every (re)render in this app, so a
// module-level snapshot is a reliable way for click handlers to read the live
// state/ctx needed to build a session order — without threading them through.
let lastContext = { state: {}, ctx: {} };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clean(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function currentDate(ctx) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean(ctx?.todayKey))) {
    try {
      return parseDateKey(ctx.todayKey);
    } catch {
      // Fall through to the supplied clock.
    }
  }
  const value = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function currentNow(ctx) {
  const value = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round(finite(ms) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function reviewMap(state) {
  const map = new Map();
  const reviews = Array.isArray(state?.quizReviews) ? state.quizReviews : [];
  for (const review of reviews) {
    if (!review || review.deletedAt) continue;
    const key = clean(review.questionId) || clean(review.id);
    if (key) map.set(key, review);
  }
  return map;
}

function reviewFor(map, question) {
  return map.get(question.id) || createReview(question.id, question.topic);
}

function dailyTotals(state) {
  const daily = state?.quizDaily && typeof state.quizDaily === "object" ? state.quizDaily : {};
  return Object.values(daily).reduce(
    (totals, value) => {
      totals.reviewed += Math.max(0, finite(value?.reviewed));
      totals.correct += Math.max(0, finite(value?.correct));
      totals.seconds += Math.max(0, finite(value?.seconds));
      return totals;
    },
    { reviewed: 0, correct: 0, seconds: 0 }
  );
}

function secondsOn(state, key) {
  return Math.max(0, finite(state?.quizDaily?.[key]?.seconds));
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(finite(totalSeconds)));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function reviewedOn(state, key) {
  return Math.max(0, finite(state?.quizDaily?.[key]?.reviewed));
}

function studyStreak(state, today) {
  let cursor = new Date(today);
  let streak = 0;
  for (let index = 0; index < 730; index += 1) {
    if (reviewedOn(state, dateKey(cursor)) <= 0) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Public so the nav badge and tests share one definition of "due".
export function dueCount(state, ctx = {}) {
  const today = dateKey(currentDate(ctx));
  const map = reviewMap(state);
  return QUIZ_QUESTIONS.reduce(
    (count, question) => count + (isDue(map.get(question.id), today) ? 1 : 0),
    0
  );
}

export function buildScorecard(state, ctx = {}) {
  const today = dateKey(currentDate(ctx));
  const map = reviewMap(state);
  const totals = dailyTotals(state);
  const decks = QUIZ_TOPICS.map((topic) => {
    const questions = QUIZ_QUESTIONS.filter((question) => question.topic === topic.key);
    let mastered = 0;
    let due = 0;
    for (const question of questions) {
      const review = map.get(question.id);
      if (isMastered(review)) mastered += 1;
      if (isDue(review, today)) due += 1;
    }
    return {
      key: topic.key,
      label: topic.label,
      total: questions.length,
      mastered,
      due,
      percent: questions.length ? Math.round((mastered / questions.length) * 100) : 0
    };
  });
  const total = QUIZ_QUESTIONS.length;
  const mastered = decks.reduce((sum, deck) => sum + deck.mastered, 0);
  return {
    total,
    mastered,
    masteryPercent: total ? Math.round((mastered / total) * 100) : 0,
    dueToday: decks.reduce((sum, deck) => sum + deck.due, 0),
    reviewedToday: reviewedOn(state, today),
    accuracy: totals.reviewed ? Math.round((totals.correct / totals.reviewed) * 100) : 0,
    totalReviewed: totals.reviewed,
    streak: studyStreak(state, currentDate(ctx)),
    secondsToday: secondsOn(state, today),
    secondsTotal: totals.seconds,
    decks
  };
}

// Build an ordered list of question ids for a study session. "deck" walks a
// whole topic (due cards first), "due" gathers every due card, "mock" takes a
// shuffled mixed sample. Ordering puts the least-recently-seen first.
export function buildOrder(state, ctx, { source = "deck", topic = "" } = {}) {
  const today = dateKey(currentDate(ctx));
  const map = reviewMap(state);
  const byRecency = (left, right) => {
    const a = finite(map.get(left.id)?.lastReviewedAt);
    const b = finite(map.get(right.id)?.lastReviewedAt);
    return a - b;
  };

  if (source === "mock") {
    const ids = QUIZ_QUESTIONS.map((question) => question.id);
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, SESSION_SIZE);
  }

  const pool = source === "deck"
    ? QUIZ_QUESTIONS.filter((question) => question.topic === topic)
    : QUIZ_QUESTIONS;
  const due = pool.filter((question) => isDue(map.get(question.id), today)).sort(byRecency);
  if (source === "due") {
    return due.map((question) => question.id).slice(0, SESSION_SIZE);
  }
  const rest = pool.filter((question) => !isDue(map.get(question.id), today)).sort(byRecency);
  return [...due, ...rest].map((question) => question.id).slice(0, SESSION_SIZE);
}

/* ------------------------------------------------------------------ browser */

function renderStat(label, value, extra = "") {
  return `
    <article class="quiz-stat">
      <span class="quiz-stat__label">${escapeHtml(label)}</span>
      <strong class="quiz-stat__value">${escapeHtml(String(value))}</strong>
      ${extra}
    </article>
  `;
}

function renderDeck(deck) {
  return `
    <button
      class="quiz-deck"
      type="button"
      data-action="quiz/open-deck"
      data-topic="${escapeHtml(deck.key)}"
      ${deck.total ? "" : "disabled"}
    >
      <span class="quiz-deck__ring" style="--pct:${deck.percent}" aria-hidden="true">
        <span class="quiz-deck__ring-value">${deck.percent}%</span>
      </span>
      <span class="quiz-deck__body">
        <strong class="quiz-deck__title">${escapeHtml(deck.label)}</strong>
        <span class="quiz-deck__meta">${deck.total} cards${deck.due ? ` · ${deck.due} due` : " · all caught up"}</span>
      </span>
    </button>
  `;
}

// Legend explaining the 1-5 confidence scale (shown on the deck screen and
// reusable elsewhere) so the rating buttons make sense.
function renderRatingScale() {
  return `
    <section class="quiz-scale" aria-label="Rating scale">
      <h3 class="quiz-section-title">Rating scale</h3>
      <p class="muted">After you reveal a card, rate how well you knew it. Lower scores come back sooner; higher scores are spaced out further.</p>
      <ul class="quiz-scale__list">
        ${RATINGS.map((rating) => `
          <li class="quiz-scale__item">
            <span class="quiz-conf quiz-conf--${rating.value}">${rating.value}</span>
            <span>${escapeHtml(rating.hint)}</span>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function confidenceChip(review) {
  if (isMastered(review)) return { cls: "quiz-conf--mastered", text: "✓", title: "Mastered" };
  const last = finite(review?.lastRating);
  if (!review || last < 1) return { cls: "quiz-conf--new", text: "•", title: "New — not studied yet" };
  const rating = Math.max(1, Math.min(5, last));
  return { cls: `quiz-conf--${rating}`, text: String(rating), title: `Last rated ${rating}/5` };
}

function renderDeckDetail(state, ctx, topicKey) {
  const today = dateKey(currentDate(ctx));
  const map = reviewMap(state);
  const questions = QUIZ_QUESTIONS.filter((question) => question.topic === topicKey);
  const card = buildScorecard(state, ctx);
  const deck = card.decks.find((item) => item.key === topicKey)
    || { label: topicLabel(topicKey), total: questions.length, mastered: 0, due: questions.length, percent: 0 };

  return `
    <section class="progress-subview quiz-view quiz-deck-detail" data-progress-view="interview" aria-labelledby="quiz-title">
      <header class="quiz-studybar">
        <button class="quiz-studybar__exit" type="button" data-action="quiz/close-deck" aria-label="Back to decks">&larr; Decks</button>
        <h2 id="quiz-title" class="quiz-studybar__title">${escapeHtml(deck.label)}</h2>
        <span class="quiz-studybar__counter">${deck.mastered}/${deck.total} mastered</span>
      </header>
      <div class="quiz-hero__bar" aria-hidden="true"><span style="width:${deck.percent}%"></span></div>

      <div class="quiz-deck-detail__actions">
        <button class="button button--primary" type="button" data-action="quiz/study-deck" data-topic="${escapeHtml(topicKey)}">
          Study this deck${deck.due ? ` · ${deck.due} due` : ""}
        </button>
      </div>

      ${renderRatingScale()}

      <section aria-labelledby="quiz-cardlist-title">
        <h3 id="quiz-cardlist-title" class="quiz-section-title">Cards (${questions.length})</h3>
        <ul class="quiz-cardlist">
          ${questions.map((question) => {
            const review = map.get(question.id);
            const chip = confidenceChip(review);
            const due = isDue(review, today);
            return `
              <li class="quiz-cardlist__item">
                <span class="quiz-conf ${chip.cls}" title="${escapeHtml(chip.title)}">${chip.text}</span>
                <details class="quiz-cardlist__details">
                  <summary>
                    <span class="quiz-cardlist__prompt">${escapeHtml(question.prompt)}</span>
                    ${due ? '<span class="quiz-cardlist__due">due</span>' : ""}
                  </summary>
                  <p class="quiz-cardlist__answer">${escapeHtml(question.answer)}</p>
                  ${question.note ? `<p class="quiz-cardlist__note">${escapeHtml(question.note)}</p>` : ""}
                </details>
              </li>
            `;
          }).join("")}
        </ul>
      </section>
    </section>
  `;
}

function renderBrowser(state, ctx) {
  const card = buildScorecard(state, ctx);
  return `
    <section class="progress-subview quiz-view quiz-browser" data-progress-view="interview" aria-labelledby="quiz-title">
      <header class="quiz-hero">
        <div class="quiz-hero__head">
          <div>
            <p class="eyebrow">Interview flashcards</p>
            <h2 id="quiz-title">Essex AI/ML Engineer</h2>
            <p class="muted">Confidence-based repetition · ${card.total} cards across ${card.decks.length} decks</p>
          </div>
          <div class="quiz-hero__mastery" role="img" aria-label="${card.masteryPercent}% mastered overall">
            <span class="quiz-hero__mastery-value">${card.masteryPercent}%</span>
            <span class="quiz-hero__mastery-label">mastered</span>
          </div>
        </div>
        <div class="quiz-hero__bar" aria-hidden="true">
          <span style="width:${card.masteryPercent}%"></span>
        </div>
        <div class="quiz-hero__actions">
          <button class="button button--primary" type="button" data-action="quiz/study-due" ${card.dueToday ? "" : "disabled"}>
            Study ${card.dueToday} due card${card.dueToday === 1 ? "" : "s"}
          </button>
          <button class="button button--secondary" type="button" data-action="quiz/study-mock">Mock interview</button>
          <button class="button button--ghost button--sm" type="button" data-action="quiz/reset">Reset</button>
        </div>
      </header>

      <section class="quiz-scorecard" aria-label="Revision scorecard">
        ${renderStat("Due today", card.dueToday)}
        ${renderStat("Reviewed today", card.reviewedToday)}
        ${renderStat("Time today", formatDuration(card.secondsToday))}
        ${renderStat("Total time", formatDuration(card.secondsTotal))}
        ${renderStat("Day streak", card.streak)}
        ${renderStat("Accuracy", card.totalReviewed ? `${card.accuracy}%` : "—")}
      </section>

      <section aria-labelledby="quiz-decks-title">
        <h3 id="quiz-decks-title" class="quiz-section-title">Decks</h3>
        <div class="quiz-deck-grid">
          ${card.decks.map(renderDeck).join("")}
        </div>
      </section>
    </section>
  `;
}

/* -------------------------------------------------------------------- study */

function renderConfidence(question) {
  const buttons = RATINGS.map((rating) => `
    <button
      class="quiz-confidence__btn quiz-confidence__btn--${rating.value}"
      type="button"
      data-action="quiz/answer"
      data-question-id="${escapeHtml(question.id)}"
      data-topic="${escapeHtml(question.topic)}"
      data-rating="${rating.value}"
    >
      <span class="quiz-confidence__num">${rating.label}</span>
      <span class="quiz-confidence__hint">${escapeHtml(rating.hint)}</span>
    </button>
  `).join("");
  return `
    <div class="quiz-confidence" data-quiz-confidence hidden>
      <p class="quiz-confidence__prompt">How well did you know it? <span class="quiz-confidence__keys">press 1-5</span></p>
      <div class="quiz-confidence__row">${buttons}</div>
    </div>
  `;
}

function renderFlashcard(question, review) {
  const last = Math.max(0, Math.min(5, finite(review?.lastRating)));
  return `
    <div class="quiz-stage">
      <div class="quiz-flashcard" data-quiz-flashcard data-confidence="${last}">
        <button class="quiz-flashcard__face quiz-flashcard__front" type="button" data-action="quiz/flip" data-quiz-flip>
          <span class="quiz-flashcard__topic">${escapeHtml(topicLabel(question.topic))}</span>
          <span class="quiz-flashcard__text">${escapeHtml(question.prompt)}</span>
          <span class="quiz-flashcard__hint">Tap or press Space to reveal</span>
        </button>
        <div class="quiz-flashcard__face quiz-flashcard__back">
          <span class="quiz-flashcard__label">Answer</span>
          <span class="quiz-flashcard__text quiz-flashcard__answer">${escapeHtml(question.answer)}</span>
          ${question.note ? `<span class="quiz-flashcard__note">${escapeHtml(question.note)}</span>` : ""}
        </div>
      </div>
      <button class="button button--primary quiz-reveal" type="button" data-action="quiz/flip" data-quiz-reveal>Reveal answer</button>
      ${renderConfidence(question)}
    </div>
  `;
}

function renderSummary(state, ctx, session) {
  const results = Array.isArray(session.results) ? session.results : [];
  const total = results.length;
  const confident = results.filter((item) => finite(item.rating) >= 4).length;
  const elapsed = formatElapsed(finite(session.finishedAt) - finite(session.startedAt));
  const weak = results
    .filter((item) => finite(item.rating) <= 2)
    .map((item) => QUESTION_BY_ID.get(item.questionId))
    .filter(Boolean);
  const source = clean(session.source) || "deck";
  const nextLabel = source === "mock" ? "New mock round" : "Study next 10";
  const nextAction = source === "mock"
    ? "quiz/study-mock"
    : source === "due"
      ? "quiz/study-due"
      : "quiz/study-deck";
  const remaining = source === "mock"
    ? QUIZ_QUESTIONS.length
    : buildOrder(state, ctx, { source, topic: clean(session.deck) }).length;
  return `
    <section class="progress-subview quiz-view quiz-study" data-progress-view="interview" aria-labelledby="quiz-title">
      <header class="quiz-studybar">
        <button class="quiz-studybar__exit" type="button" data-action="quiz/exit" aria-label="Back to decks">&larr; Decks</button>
        <h2 id="quiz-title" class="quiz-studybar__title">Round complete</h2>
        <span class="quiz-studybar__counter">${escapeHtml(elapsed)}</span>
      </header>
      <div class="quiz-summary">
        <p class="quiz-summary__headline">You answered ${confident} of ${total} confidently in ${escapeHtml(elapsed)}.</p>
        <section class="quiz-scorecard">
          ${renderStat("Cards", total)}
          ${renderStat("Confident (4-5)", total ? `${Math.round((confident / total) * 100)}%` : "0%")}
          ${renderStat("Time", elapsed)}
        </section>
        ${weak.length ? `
          <h3 class="quiz-section-title">Revisit these (rated 1-2)</h3>
          <ul class="quiz-weak-list">
            ${weak.map((question) => `
              <li>
                <strong>${escapeHtml(question.prompt)}</strong>
                <span>${escapeHtml(topicLabel(question.topic))}</span>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="quiz-summary__clear">No weak spots flagged — strong round.</p>'}
        <div class="quiz-summary__actions">
          ${remaining ? `<button class="button button--primary" type="button" data-action="${nextAction}" data-topic="${escapeHtml(clean(session.deck))}">${nextLabel}</button>` : ""}
          ${weak.length ? '<button class="button button--secondary" type="button" data-action="quiz/study-weak">Drill the weak ones</button>' : ""}
          <button class="button button--ghost" type="button" data-action="quiz/exit">Back to decks</button>
        </div>
      </div>
    </section>
  `;
}

function renderStudy(state, ctx, session) {
  const total = session.order.length;
  const index = Math.min(finite(session.index), total);
  if (session.finishedAt || index >= total) {
    return renderSummary(state, ctx, session);
  }
  const map = reviewMap(state);
  const question = QUESTION_BY_ID.get(session.order[index]);
  const elapsed = formatElapsed(currentNow(ctx) - finite(session.startedAt));
  const progress = total ? Math.round((index / total) * 100) : 0;
  return `
    <section class="progress-subview quiz-view quiz-study" data-progress-view="interview" aria-labelledby="quiz-title">
      <header class="quiz-studybar">
        <button class="quiz-studybar__exit" type="button" data-action="quiz/exit" aria-label="Back to decks">&larr; Decks</button>
        <h2 id="quiz-title" class="quiz-studybar__title">${escapeHtml(session.label || "Studying")}</h2>
        <span class="quiz-studybar__counter">${index + 1} / ${total} · ${escapeHtml(elapsed)}</span>
      </header>
      <div class="quiz-studybar__progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
      ${question
        ? renderFlashcard(question, reviewFor(map, question))
        : '<p class="empty-state">This card is no longer in the bank.</p>'}
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  lastContext = { state, ctx };
  const session = state?.ui?.quizSession;
  if (session && Array.isArray(session.order) && session.order.length) {
    return renderStudy(state, ctx, session);
  }
  const deck = clean(state?.ui?.quizDeck);
  if (deck && QUIZ_TOPICS.some((topic) => topic.key === deck)) {
    return renderDeckDetail(state, ctx, deck);
  }
  return renderBrowser(state, ctx);
}

/* --------------------------------------------------------------------- bind */

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  if (typeof root.querySelectorAll === "function" && typeof root.querySelector !== "function") return;
  const scope = root.matches?.('[data-progress-view="interview"]')
    ? root
    : root.querySelector?.('[data-progress-view="interview"]');
  if (typeof root.querySelector === "function" && !scope) return;
  const target = scope || root;
  const previous = bindings.get(root);
  if (previous) {
    previous.target.removeEventListener("click", previous.click);
    if (previous.keydown && typeof document !== "undefined") {
      document.removeEventListener("keydown", previous.keydown);
    }
    previous.detachGlossary?.();
  }

  const startSession = (source, topic, label, order) => {
    const ids = order || buildOrder(lastContext.state, lastContext.ctx, { source, topic });
    if (!ids.length) return;
    actions.dispatch?.({ type: "quiz/start", payload: { source, deck: topic || "", label, order: ids } });
  };

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !target.contains(control) || control.disabled) return;
    const action = control.dataset.action;
    const today = dateKey(currentDate(lastContext.ctx));

    if (action === "quiz/flip") {
      const stage = control.closest?.(".quiz-stage") || target;
      const flashcard = stage.querySelector?.("[data-quiz-flashcard]");
      const confidence = stage.querySelector?.("[data-quiz-confidence]");
      const reveal = stage.querySelector?.("[data-quiz-reveal]");
      flashcard?.classList?.add("is-flipped");
      if (confidence) confidence.hidden = false;
      if (reveal) reveal.hidden = true;
    } else if (action === "quiz/answer") {
      const rating = Math.max(1, Math.min(5, Math.round(finite(control.dataset.rating))));
      const questionId = clean(control.dataset.questionId);
      if (!questionId || !rating) return;
      actions.dispatch?.({
        type: "quiz/answer",
        payload: { questionId, topic: clean(control.dataset.topic), rating, today }
      });
    } else if (action === "quiz/open-deck") {
      actions.dispatch?.({ type: "ui/setQuizDeck", payload: { deck: clean(control.dataset.topic) } });
    } else if (action === "quiz/close-deck") {
      actions.dispatch?.({ type: "ui/setQuizDeck", payload: { deck: "" } });
    } else if (action === "quiz/study-deck") {
      const topic = clean(control.dataset.topic);
      startSession("deck", topic, topicLabel(topic));
    } else if (action === "quiz/study-due") {
      startSession("due", "", "Due cards");
    } else if (action === "quiz/study-mock") {
      startSession("mock", "", "Mock interview");
    } else if (action === "quiz/study-weak") {
      const results = lastContext.state?.ui?.quizSession?.results || [];
      const weak = results.filter((item) => finite(item.rating) <= 2).map((item) => clean(item.questionId)).filter(Boolean);
      startSession("deck", "", "Weak cards", weak.length ? weak : null);
    } else if (action === "quiz/exit") {
      actions.dispatch?.({ type: "quiz/exit", payload: {} });
    } else if (action === "quiz/reset") {
      const ok = typeof window === "undefined" || !window.confirm
        ? true
        : window.confirm("Reset all flashcard progress? This clears your confidence ratings and scorecard.");
      if (ok) actions.dispatch?.({ type: "quiz/reset", payload: {} });
    }
  };

  // Keyboard controls, Brainscape-style: Space/Enter flips the card, 1-5 rates.
  const keydown = (event) => {
    const flashcard = target.querySelector?.("[data-quiz-flashcard]");
    if (!flashcard) return;
    const tag = (event.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || event.metaKey || event.ctrlKey || event.altKey) return;
    const flipped = flashcard.classList?.contains?.("is-flipped");
    if (!flipped) {
      if (event.key === " " || event.key === "Enter" || event.key === "Spacebar") {
        event.preventDefault();
        flashcard.querySelector?.("[data-quiz-flip]")?.click?.();
      }
      return;
    }
    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault();
      target.querySelector?.(`.quiz-confidence__btn--${event.key}`)?.click?.();
    }
  };

  target.addEventListener("click", click);
  if (typeof document !== "undefined") document.addEventListener("keydown", keydown);
  const detachGlossary = attachGlossary(target);
  bindings.set(root, { click, keydown, target, detachGlossary });

  return () => {
    target.removeEventListener("click", click);
    if (typeof document !== "undefined") document.removeEventListener("keydown", keydown);
    detachGlossary();
  };
}
