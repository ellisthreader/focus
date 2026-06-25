import test from "node:test";
import assert from "node:assert/strict";
import { bind, page, render } from "../src/features/finance.mjs";

const ctx = {
  todayKey: "2026-06-08",
  now: new Date(2026, 5, 8, 12, 0, 0),
  locale: "en-US"
};

function rootHarness() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    contains() {
      return true;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function control(dataset, owner = {}) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      if (selector === "[data-action]" || selector.includes('role="tab"')) return this;
      const match = selector.match(/^\[data-(.+)\]$/);
      if (!match) return null;
      const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return owner[key] ? { dataset: { [key]: owner[key] } } : null;
    }
  };
}

test("exports the dedicated Finance page contract", () => {
  assert.deepEqual(page, {
    id: "finance",
    label: "Finance",
    icon: "wallet"
  });
});

test("calculates current-month income, spending net of refunds, refunds, and balance", () => {
  const html = render({
    settings: { finance: { currency: "USD" } },
    financeEntries: [
      { id: "income", date: "2026-06-01", label: "Salary", amountMinor: 300000, kind: "income", currency: "USD" },
      { id: "expense", date: "2026-06-02", label: "Rent", amountMinor: 125050, kind: "expense", currency: "USD", category: "Housing" },
      { id: "refund", date: "2026-06-03", label: "Rent credit", amountMinor: 2500, kind: "refund", currency: "USD", category: "Housing" },
      { id: "excluded", date: "2026-06-04", label: "Ignored", amountMinor: 99999, kind: "expense", currency: "USD", excluded: true },
      { id: "deleted", date: "2026-06-05", label: "Deleted secret", amountMinor: 50000, kind: "expense", currency: "USD", deletedAt: 1 },
      { id: "old", date: "2026-05-30", label: "Previous month", amountMinor: 10000, kind: "expense", currency: "USD" },
      { id: "other-currency", date: "2026-06-06", label: "Euro item", amountMinor: 999999, kind: "expense", currency: "EUR" }
    ]
  }, ctx);

  assert.match(html, /<dt>Income<\/dt>\s*<dd>\$3,000\.00<\/dd>/);
  assert.match(html, /<dt>Spending<\/dt>\s*<dd>\$1,225\.50<\/dd>/);
  assert.match(html, /<dt>Refunds<\/dt>\s*<dd>\$25\.00<\/dd>/);
  assert.match(html, /<dt>Balance<\/dt>\s*<dd>\$1,774\.50<\/dd>/);
  assert.match(html, /Previous month/);
  assert.match(html, /Ignored[\s\S]*Excluded from totals/);
  assert.doesNotMatch(html, /Deleted secret/);
});

test("renders one transaction action, recent records, planning views, and no account details", () => {
  const html = render({
    settings: { financeCurrency: "GBP" },
    ui: { financeView: "goals" },
    financeEntries: [{
      id: "entry-1",
      date: "2026-06-08",
      label: "<Groceries>",
      amountMinor: 3250,
      kind: "expense",
      currency: "GBP",
      category: "Food",
      account: "Private current account"
    }],
    financeBudgets: [{
      id: "budget-1",
      category: "Food",
      monthlyLimitMinor: 10000,
      active: true
    }],
    financeRecurring: [{
      id: "recurring-1",
      name: "Broadband",
      amountMinor: 2999,
      kind: "expense",
      currency: "GBP",
      frequency: "monthly",
      nextDueDate: "2026-06-12",
      active: true
    }],
    financeGoals: [{
      id: "goal-1",
      name: "Emergency fund",
      kind: "saving",
      targetAmountMinor: 100000,
      currentAmountMinor: 25000,
      targetDate: "2026-12-31",
      active: true
    }]
  }, { ...ctx, locale: "en-GB" });

  assert.equal((html.match(/>Add transaction</g) || []).length, 1);
  assert.match(html, /&lt;Groceries&gt;/);
  assert.match(html, /£32\.50/);
  assert.doesNotMatch(html, /Private current account/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="finance-panel-budgets"/);
  assert.match(html, /£32\.50 of £100\.00/);
  assert.match(html, /Broadband/);
  assert.match(html, /Emergency fund/);
  assert.match(html, /<progress value="25" max="100" aria-label="Emergency fund progress">/);
  assert.match(html, /id="finance-tab-goals"[\s\S]*aria-selected="true"/);
});

test("bind opens editors, dispatches deletes, and switches finance views", () => {
  const root = rootHarness();
  const opened = [];
  const dispatched = [];
  bind(root, {
    openEditor(kind, id) {
      opened.push([kind, id]);
    },
    dispatch(action) {
      dispatched.push(action);
    }
  });

  const click = root.listeners.get("click");
  click({ target: control({ action: "finance/add-entry" }) });
  click({ target: control({ action: "finance/edit-entry" }, { financeEntryId: "entry-1" }) });
  click({ target: control({ action: "finance/delete-entry" }, { financeEntryId: "entry-1" }) });
  click({ target: control({ action: "finance/add-budget" }) });
  click({ target: control({ action: "finance/edit-budget" }, { financeBudgetId: "budget-1" }) });
  click({ target: control({ action: "finance/delete-budget" }, { financeBudgetId: "budget-1" }) });
  click({ target: control({ action: "finance/add-recurring" }) });
  click({ target: control({ action: "finance/edit-recurring" }, { financeRecurringId: "recurring-1" }) });
  click({ target: control({ action: "finance/delete-recurring" }, { financeRecurringId: "recurring-1" }) });
  click({ target: control({ action: "finance/add-goal" }) });
  click({ target: control({ action: "finance/edit-goal" }, { financeGoalId: "goal-1" }) });
  click({ target: control({ action: "finance/delete-goal" }, { financeGoalId: "goal-1" }) });
  click({ target: control({ action: "finance/switch-view", view: "recurring" }) });

  assert.deepEqual(opened, [
    ["financeEntry", undefined],
    ["financeEntry", "entry-1"],
    ["financeBudget", undefined],
    ["financeBudget", "budget-1"],
    ["financeRecurring", undefined],
    ["financeRecurring", "recurring-1"],
    ["financeGoal", undefined],
    ["financeGoal", "goal-1"]
  ]);
  assert.deepEqual(dispatched, [
    { type: "financeEntry/delete", payload: { id: "entry-1" } },
    { type: "financeBudget/delete", payload: { id: "budget-1" } },
    { type: "financeRecurring/delete", payload: { id: "recurring-1" } },
    { type: "financeGoal/delete", payload: { id: "goal-1" } },
    { type: "ui/setFinanceView", payload: { view: "recurring" } }
  ]);
});
