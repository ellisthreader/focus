import * as engine from "./interview-quiz.mjs";

// Top-level page wrapper around the interview-quiz engine. The engine owns the
// scorecard, daily-drill and mock-interview rendering/binding; this module just
// gives it a proper page shell and a slot in the primary navigation.
export const page = Object.freeze({
  id: "quiz",
  label: "Quiz",
  icon: "book"
});

export function render(state = {}, ctx = {}) {
  return `
    <main class="page quiz-page" aria-labelledby="quiz-title">
      ${engine.render(state, ctx)}
    </main>
  `;
}

export function bind(root, actions = {}) {
  return engine.bind(root, actions);
}
