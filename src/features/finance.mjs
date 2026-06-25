export const page = Object.freeze({
  id: "finance",
  label: "Finance",
  icon: "wallet"
});

const bindings = new WeakMap();
const VIEWS = new Set(["budgets", "recurring", "goals"]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clean(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function minor(value) {
  return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : 0n;
}

function currencyCode(state) {
  const configured = clean(state?.settings?.finance?.currency)
    || clean(state?.settings?.financeCurrency)
    || "USD";
  return /^[A-Za-z]{3}$/.test(configured) ? configured.toUpperCase() : "USD";
}

function currentDate(ctx) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean(ctx?.todayKey))) {
    const [year, month, day] = ctx.todayKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const source = typeof ctx?.now === "function" ? ctx.now() : ctx?.now;
  const date = source instanceof Date ? new Date(source.getTime()) : new Date(source ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function entryDate(entry) {
  return clean(entry?.date).slice(0, 10);
}

function isLive(item) {
  return Boolean(item) && !item.deletedAt;
}

function entryCurrency(entry, fallback) {
  const value = clean(entry?.currency, fallback);
  return /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : fallback;
}

function currencyDigits(currency, locale) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

function formatMoney(amountMinor, currency, locale) {
  const amount = typeof amountMinor === "bigint" ? amountMinor : minor(amountMinor);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const digits = currencyDigits(currency, locale);
  const scale = 10n ** BigInt(digits);
  const whole = scale ? absolute / scale : absolute;
  const fraction = scale ? String(absolute % scale).padStart(digits, "0") : "";

  try {
    const currencyFormatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
    const template = currencyFormatter.formatToParts(negative ? -1 : 1);
    const firstNumber = template.findIndex((part) => part.type === "integer");
    let lastNumber = firstNumber;
    while (lastNumber + 1 < template.length
      && ["integer", "group", "decimal", "fraction"].includes(template[lastNumber + 1].type)) {
      lastNumber += 1;
    }
    const groupedWhole = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      useGrouping: true
    }).format(whole);
    const decimal = template.find((part) => part.type === "decimal")?.value || ".";
    const number = `${groupedWhole}${digits ? `${decimal}${fraction}` : ""}`;
    return [
      ...template.slice(0, firstNumber).map((part) => part.value),
      number,
      ...template.slice(lastNumber + 1).map((part) => part.value)
    ].join("");
  } catch {
    return `${negative ? "-" : ""}${currency} ${whole}${digits ? `.${fraction}` : ""}`;
  }
}

function formatDate(value, ctx) {
  const key = clean(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "Date not set";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat(ctx?.locale, {
    month: "short",
    day: "numeric",
    year: year === currentDate(ctx).getFullYear() ? undefined : "numeric"
  }).format(date);
}

function monthLabel(date, locale) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function percent(current, target) {
  if (target <= 0n) return 0;
  const rounded = (current * 100n + target / 2n) / target;
  return Number(rounded > 100n ? 100n : rounded);
}

function monthModel(state, ctx) {
  const now = currentDate(ctx);
  const prefix = dateKey(now).slice(0, 7);
  const currency = currencyCode(state);
  const recentEntries = list(state?.financeEntries).filter(isLive);
  const entries = recentEntries
    .filter((entry) => entryDate(entry).startsWith(prefix))
    .filter((entry) => entryCurrency(entry, currency) === currency);
  const included = entries.filter((entry) => entry.excluded !== true);

  let income = 0n;
  let expenses = 0n;
  let refunds = 0n;
  for (const entry of included) {
    const amount = minor(entry.amountMinor);
    if (entry.kind === "income") income += amount;
    else if (entry.kind === "refund") refunds += amount;
    else expenses += amount;
  }

  return {
    currency,
    entries,
    recentEntries,
    included,
    income,
    refunds,
    spending: expenses - refunds,
    balance: income - expenses + refunds,
    now
  };
}

function renderMetric(label, value, model, ctx) {
  return `
    <div class="finance-metric">
      <dt>${label}</dt>
      <dd>${escapeHtml(formatMoney(value, model.currency, ctx?.locale))}</dd>
    </div>
  `;
}

function renderTransactions(entries, currency, ctx) {
  const recent = [...entries]
    .sort((left, right) => entryDate(right).localeCompare(entryDate(left))
      || Number(right?.createdAt || 0) - Number(left?.createdAt || 0))
    .slice(0, 12);

  if (!recent.length) {
    return '<p class="empty-state">No transactions recorded this month.</p>';
  }

  return `
    <ul class="item-list finance-transactions">
      ${recent.map((entry) => {
        const kind = ["income", "refund"].includes(entry?.kind) ? entry.kind : "expense";
        const sign = kind === "expense" ? "−" : "+";
        const amount = formatMoney(minor(entry?.amountMinor), entryCurrency(entry, currency), ctx?.locale);
        return `
          <li class="list-row finance-transaction" data-finance-entry-id="${escapeHtml(entry?.id)}">
            <span class="badge">${escapeHtml(kind === "expense" ? "Expense" : kind === "income" ? "Income" : "Refund")}</span>
            <div class="row-content">
              <strong>${escapeHtml(clean(entry?.label, "Untitled transaction"))}</strong>
              <span>${escapeHtml(formatDate(entryDate(entry), ctx))}${entry?.category ? ` · ${escapeHtml(entry.category)}` : ""}${entry?.excluded ? " · Excluded from totals" : ""}</span>
            </div>
            <strong class="finance-amount finance-amount--${kind}">${sign}${escapeHtml(amount)}</strong>
            <div class="toolbar-row">
              <button class="button button--ghost button--sm" type="button" data-action="finance/edit-entry">Edit</button>
              <button class="button button--ghost button--sm" type="button" data-action="finance/delete-entry">Delete</button>
            </div>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function categorySpending(entries) {
  const totals = new Map();
  for (const entry of entries) {
    const category = clean(entry?.category, "Uncategorised");
    const current = totals.get(category) || 0n;
    if (entry?.kind === "expense") totals.set(category, current + minor(entry?.amountMinor));
    else if (entry?.kind === "refund") totals.set(category, current - minor(entry?.amountMinor));
  }
  return totals;
}

function renderBudgets(state, model, ctx) {
  const budgets = list(state?.financeBudgets).filter((item) => isLive(item) && item.active !== false);
  const spending = categorySpending(model.included);
  if (!budgets.length) {
    return '<p class="empty-state">No active budgets. Add one to compare category spending with a monthly limit.</p>';
  }

  return `
    <ul class="item-list">
      ${budgets.map((budget) => {
        const used = spending.get(clean(budget?.category, "Uncategorised")) || 0n;
        const limit = minor(budget?.monthlyLimitMinor);
        const progress = percent(used > 0n ? used : 0n, limit);
        return `
          <li class="list-row" data-finance-budget-id="${escapeHtml(budget?.id)}">
            <div class="row-content">
              <strong>${escapeHtml(clean(budget?.category, "Uncategorised"))}</strong>
              <span>${escapeHtml(formatMoney(used, model.currency, ctx?.locale))} of ${escapeHtml(formatMoney(limit, model.currency, ctx?.locale))}</span>
              <progress value="${progress}" max="100" aria-label="${escapeHtml(`${clean(budget?.category, "Budget")} usage`)}">${progress}%</progress>
            </div>
            <div class="toolbar-row">
              <button class="button button--ghost button--sm" type="button" data-action="finance/edit-budget">Edit</button>
              <button class="button button--ghost button--sm" type="button" data-action="finance/delete-budget">Delete</button>
            </div>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function renderRecurring(state, model, ctx) {
  const recurring = list(state?.financeRecurring)
    .filter((item) => isLive(item) && item.active !== false)
    .sort((left, right) => clean(left?.nextDueDate, "9999").localeCompare(clean(right?.nextDueDate, "9999")));
  if (!recurring.length) {
    return '<p class="empty-state">No active recurring income, subscriptions, or bills.</p>';
  }

  return `
    <ul class="item-list">
      ${recurring.map((item) => `
        <li class="list-row" data-finance-recurring-id="${escapeHtml(item?.id)}">
          <span class="badge">${escapeHtml(item?.kind === "income" ? "Income" : item?.kind === "refund" ? "Refund" : "Bill")}</span>
          <div class="row-content">
            <strong>${escapeHtml(clean(item?.name, "Untitled recurring item"))}</strong>
            <span>${escapeHtml(formatMoney(minor(item?.amountMinor), entryCurrency(item, model.currency), ctx?.locale))} · ${escapeHtml(clean(item?.frequency, "monthly"))} · next ${escapeHtml(formatDate(item?.nextDueDate, ctx))}</span>
          </div>
          <div class="toolbar-row">
            <button class="button button--ghost button--sm" type="button" data-action="finance/edit-recurring">Edit</button>
            <button class="button button--ghost button--sm" type="button" data-action="finance/delete-recurring">Delete</button>
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderGoals(state, model, ctx) {
  const goals = list(state?.financeGoals).filter((item) => isLive(item) && item.active !== false);
  if (!goals.length) {
    return '<p class="empty-state">No active savings or debt goals.</p>';
  }

  return `
    <ul class="item-list">
      ${goals.map((goal) => {
        const current = minor(goal?.currentAmountMinor);
        const target = minor(goal?.targetAmountMinor);
        const progress = percent(current, target);
        return `
          <li class="list-row" data-finance-goal-id="${escapeHtml(goal?.id)}">
            <span class="badge">${goal?.kind === "debt" ? "Debt" : "Saving"}</span>
            <div class="row-content">
              <strong>${escapeHtml(clean(goal?.name, "Untitled goal"))}</strong>
              <span>${escapeHtml(formatMoney(current, model.currency, ctx?.locale))} of ${escapeHtml(formatMoney(target, model.currency, ctx?.locale))}${goal?.targetDate ? ` · target ${escapeHtml(formatDate(goal.targetDate, ctx))}` : ""}</span>
              <progress value="${progress}" max="100" aria-label="${escapeHtml(`${clean(goal?.name, "Goal")} progress`)}">${progress}%</progress>
            </div>
            <div class="toolbar-row">
              <button class="button button--ghost button--sm" type="button" data-action="finance/edit-goal">Edit</button>
              <button class="button button--ghost button--sm" type="button" data-action="finance/delete-goal">Delete</button>
            </div>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function panel(view, activeView, title, description, addLabel, body) {
  const actionKind = view === "budgets" ? "budget" : view === "goals" ? "goal" : "recurring";
  return `
    <section
      class="finance-panel"
      id="finance-panel-${view}"
      data-finance-panel="${view}"
      role="tabpanel"
      aria-labelledby="finance-tab-${view}"
      ${view === activeView ? "" : "hidden"}
    >
      <header class="card__header">
        <div>
          <h3 class="card__title">${title}</h3>
          <p class="card__description">${description}</p>
        </div>
        <button class="button button--secondary button--sm" type="button" data-action="finance/add-${actionKind}">${addLabel}</button>
      </header>
      <div class="card__body">${body}</div>
    </section>
  `;
}

export function render(state = {}, ctx = {}) {
  const model = monthModel(state, ctx);
  const activeView = VIEWS.has(state?.ui?.financeView) ? state.ui.financeView : "budgets";
  return `
    <main class="page finance-page" data-page="finance" aria-labelledby="finance-title">
      <header class="page-header">
        <div class="page-header__content">
          <p class="eyebrow">${escapeHtml(monthLabel(model.now, ctx?.locale))}</p>
          <h1 class="page-header__title" id="finance-title">Finance</h1>
          <p class="page-header__description">Current-month balance: <strong>${escapeHtml(formatMoney(model.balance, model.currency, ctx?.locale))}</strong></p>
        </div>
        <button class="button button--primary" type="button" data-action="finance/add-entry">Add transaction</button>
      </header>

      <dl class="finance-summary" aria-label="Current month cash flow">
        ${renderMetric("Income", model.income, model, ctx)}
        ${renderMetric("Spending", model.spending, model, ctx)}
        ${renderMetric("Refunds", model.refunds, model, ctx)}
        ${renderMetric("Balance", model.balance, model, ctx)}
      </dl>

      <section class="card finance-recent" aria-labelledby="finance-recent-title">
        <header class="card__header">
          <div>
            <h2 class="card__title" id="finance-recent-title">Recent transactions</h2>
            <p class="card__description">Most recent records. Excluded entries remain visible but do not affect month totals.</p>
          </div>
        </header>
        <div class="card__body">${renderTransactions(model.recentEntries, model.currency, ctx)}</div>
      </section>

      <section class="card finance-planning" aria-labelledby="finance-planning-title">
        <h2 class="visually-hidden" id="finance-planning-title">Finance planning</h2>
        <div class="tab-list" role="tablist" aria-label="Finance planning views">
          ${["budgets", "recurring", "goals"].map((view) => `
            <button
              class="tab${view === activeView ? " is-active" : ""}"
              id="finance-tab-${view}"
              type="button"
              role="tab"
              data-action="finance/switch-view"
              data-view="${view}"
              aria-controls="finance-panel-${view}"
              aria-selected="${view === activeView}"
              tabindex="${view === activeView ? "0" : "-1"}"
            >${view === "budgets" ? "Budgets" : view === "recurring" ? "Recurring" : "Goals"}</button>
          `).join("")}
        </div>
        ${panel("budgets", activeView, "Monthly budgets", "Category usage for the current month.", "Add budget", renderBudgets(state, model, ctx))}
        ${panel("recurring", activeView, "Subscriptions and bills", "Active recurring items ordered by next due date.", "Add recurring", renderRecurring(state, model, ctx))}
        ${panel("goals", activeView, "Savings and debt goals", "Progress from recorded amounts, without financial advice.", "Add goal", renderGoals(state, model, ctx))}
      </section>
    </main>
  `;
}

function switchView(root, selected) {
  const view = selected?.dataset?.view;
  if (!VIEWS.has(view)) return;
  const tabs = root.querySelectorAll?.('[role="tab"][data-view]') || [];
  const panels = root.querySelectorAll?.("[data-finance-panel]") || [];
  tabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(active));
    tab.classList.toggle("is-active", active);
    tab.tabIndex = active ? 0 : -1;
  });
  panels.forEach((item) => {
    item.hidden = item.dataset.financePanel !== view;
  });
}

function ownerId(control, attribute) {
  return control.closest?.(`[data-${attribute}]`)?.dataset[
    attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  ];
}

export function bind(root, actions = {}) {
  if (!root?.addEventListener) return;
  const previous = bindings.get(root);
  if (previous) {
    root.removeEventListener("click", previous.click);
    root.removeEventListener("keydown", previous.keydown);
  }

  const click = (event) => {
    const control = event.target?.closest?.("[data-action]");
    if (!control || !root.contains(control) || control.disabled) return;
    const action = control.dataset.action;

    if (action === "finance/add-entry") {
      actions.openEditor?.("financeEntry");
    } else if (action === "finance/edit-entry") {
      const id = ownerId(control, "finance-entry-id");
      if (id) actions.openEditor?.("financeEntry", id);
    } else if (action === "finance/delete-entry") {
      const id = ownerId(control, "finance-entry-id");
      if (id) actions.dispatch?.({ type: "financeEntry/delete", payload: { id } });
    } else if (action === "finance/switch-view" && VIEWS.has(control.dataset.view)) {
      switchView(root, control);
      actions.dispatch?.({ type: "ui/setFinanceView", payload: { view: control.dataset.view } });
    } else {
      const matches = action.match(/^finance\/(add|edit|delete)-(budget|recurring|goal)$/);
      if (!matches) return;
      const [, operation, kind] = matches;
      const config = {
        budget: ["financeBudget", "finance-budget-id"],
        recurring: ["financeRecurring", "finance-recurring-id"],
        goal: ["financeGoal", "finance-goal-id"]
      }[kind];
      const id = operation === "add" ? "" : ownerId(control, config[1]);
      if (operation === "add") actions.openEditor?.(config[0]);
      else if (operation === "edit" && id) actions.openEditor?.(config[0], id);
      else if (operation === "delete" && id) {
        actions.dispatch?.({ type: `${config[0]}/delete`, payload: { id } });
      }
    }
  };

  const keydown = (event) => {
    const current = event.target?.closest?.('[role="tab"][data-view]');
    if (!current || !root.contains(current)) return;
    const tabs = Array.from(root.querySelectorAll?.('[role="tab"][data-view]') || []);
    const index = tabs.indexOf(current);
    if (index < 0) return;
    let nextIndex = index;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const next = tabs[nextIndex];
    switchView(root, next);
    actions.dispatch?.({ type: "ui/setFinanceView", payload: { view: next.dataset.view } });
    next.focus?.();
  };

  root.addEventListener("click", click);
  root.addEventListener("keydown", keydown);
  bindings.set(root, { click, keydown });
}
