import test from "node:test";
import assert from "node:assert/strict";
import { bind, render } from "../src/features/nutrition-view.mjs";

const ctx = {
  todayKey: "2026-06-08",
  now: new Date(2026, 5, 8, 12, 0, 0)
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
    }
  };
}

function control(dataset) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      return selector === "[data-action]" ? this : null;
    }
  };
}

test("renders an embeddable empty nutrition subview", () => {
  const html = render({}, ctx);

  assert.match(html, /<section class="health-subview nutrition-view"/);
  assert.doesNotMatch(html, /<main|data-page=/);
  assert.match(html, /Today's nutrition totals/);
  assert.match(html, /No meals logged today/);
  assert.match(html, /data-action="nutrition\/manual"/);
  assert.doesNotMatch(html, /Daily goal progress/);
  assert.doesNotMatch(html, /nutrition-saved-meals/);
});

test("renders today's grouped meals, totals, provenance, and enabled goals", () => {
  const html = render({
    nutritionEntries: [
      {
        id: "nutrition-1",
        date: "2026-06-08",
        mealType: "breakfast",
        name: "Porridge",
        servingAmount: 1,
        servingUnit: "bowl",
        calories: 350,
        proteinGrams: 14,
        carbsGrams: 55,
        fatGrams: 8,
        fiberGrams: 7,
        source: "usda",
        sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/1",
        confidence: "verified"
      },
      {
        id: "nutrition-2",
        date: "2026-06-08",
        mealType: "lunch",
        name: "Soup",
        calories: 250,
        proteinGrams: 10,
        carbsGrams: 30,
        fatGrams: 6,
        fiberGrams: 4,
        source: "ai_estimate",
        confidence: "estimated"
      },
      { id: "old", date: "2026-06-07", mealType: "dinner", name: "Old meal", calories: 900 }
    ],
    settings: {
      nutritionGoals: {
        enabled: true,
        calories: 2000,
        proteinGrams: 100,
        carbsGrams: 250,
        fatGrams: 70,
        fiberGrams: 30
      }
    },
    savedMeals: []
  }, ctx);

  assert.match(html, /600 kcal/);
  assert.match(html, /24g protein/);
  assert.match(html, />Breakfast</);
  assert.match(html, />Lunch</);
  assert.doesNotMatch(html, /Old meal/);
  assert.match(html, /Source:[\s\S]*USDA[\s\S]*Confidence:[\s\S]*Verified/);
  assert.match(html, /AI estimate[\s\S]*Estimated/);
  assert.match(html, /Daily goal progress/);
  assert.match(html, /<progress value="30" max="100" aria-label="Calories goal progress">/);
  assert.match(html, /nutrition-saved-meals/);
  assert.match(html, /No saved meals yet/);
});

test("renders normalized lookup results and protects markup", () => {
  const html = render({}, {
    ...ctx,
    nutritionSearch: {
      results: [{
        id: "food-1",
        name: "<Fresh yogurt>",
        servingAmount: 100,
        servingUnit: "g",
        calories: 63,
        proteinGrams: 5.3,
        source: "open_food_facts",
        confidence: "verified"
      }]
    }
  });

  assert.match(html, /&lt;Fresh yogurt&gt;/);
  assert.match(html, /Open Food Facts/);
  assert.match(html, /data-action="nutrition\/add-result"/);
  assert.match(html, /&quot;date&quot;:&quot;2026-06-08&quot;/);
  assert.match(html, /&quot;mealType&quot;:&quot;snack&quot;/);
});

test("bind searches, manually adds, adds a result, and deletes", () => {
  const root = rootHarness();
  const calls = [];
  const originalFormData = globalThis.FormData;
  globalThis.FormData = class {
    get(name) {
      return name === "query" ? "  oats  " : null;
    }
  };

  try {
    bind(root, {
      searchNutrition(query) {
        calls.push(["search", query]);
      },
      openEditor(kind) {
        calls.push(["editor", kind]);
      },
      dispatch(action) {
        calls.push(["dispatch", action]);
      }
    });

    const form = {
      closest(selector) {
        return selector === "[data-nutrition-search]" ? this : null;
      }
    };
    root.listeners.get("submit")({ target: form, preventDefault() {} });
    root.listeners.get("click")({ target: control({ action: "nutrition/manual" }) });
    root.listeners.get("click")({
      target: control({
        action: "nutrition/add-result",
        payload: JSON.stringify({ id: "food-1", name: "Oats", calories: 150 })
      })
    });
    root.listeners.get("click")({
      target: control({ action: "nutrition/delete", id: "nutrition-1" })
    });

    assert.deepEqual(calls, [
      ["search", "oats"],
      ["editor", "nutrition"],
      ["dispatch", {
        type: "nutrition/add",
        payload: { id: "food-1", name: "Oats", calories: 150 }
      }],
      ["dispatch", {
        type: "nutrition/delete",
        payload: { id: "nutrition-1" }
      }]
    ]);
  } finally {
    globalThis.FormData = originalFormData;
  }
});
