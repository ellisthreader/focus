"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createNutritionService,
  normalizeFdcFood,
  normalizeOpenFoodFactsProduct,
  parseMealComponents,
  nutritionFailure
} = require("../nutrition-service.cjs");

const SECRET_KEY = "fdc-secret-key-value";

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return value;
    }
  };
}

test("normalizes FDC nutrients from the 100 gram basis to the listed serving", () => {
  const result = normalizeFdcFood({
    fdcId: 12345,
    description: "CHEDDAR CHEESE",
    brandName: "Example Dairy",
    dataType: "Branded",
    servingSize: 25,
    servingSizeUnit: "G",
    foodNutrients: [
      { nutrientId: 1008, unitName: "KCAL", value: 400 },
      { nutrientId: 1003, unitName: "G", value: 24 },
      { nutrientId: 1005, unitName: "G", value: 2 },
      { nutrientId: 1004, unitName: "G", value: 32 },
      { nutrientId: 1079, unitName: "G", value: 0 }
    ]
  });

  assert.deepEqual(result, {
    id: "12345",
    name: "CHEDDAR CHEESE",
    brand: "Example Dairy",
    servingLabel: "",
    servingAmount: 25,
    servingUnit: "g",
    calories: 100,
    proteinGrams: 6,
    carbsGrams: 0.5,
    fatGrams: 8,
    fiberGrams: 0,
    nutrientsPer100g: {
      calories: 400,
      proteinGrams: 24,
      carbsGrams: 2,
      fatGrams: 32,
      fiberGrams: 0
    },
    sourceType: "usda",
    sourceLabel: "USDA FoodData Central",
    sourceUrl: "https://fdc.nal.usda.gov/food-details/12345/nutrients",
    confidence: "verified"
  });
});

test("resolves multi-food meals from dataset servings and aggregates macros", async () => {
  const foods = {
    "egg whole cooked": {
      fdcId: 101,
      description: "Egg, whole, cooked",
      servingSize: 50,
      servingSizeUnit: "g",
      householdServingFullText: "1 large",
      foodNutrients: [
        { nutrientId: 1008, value: 143 },
        { nutrientId: 1003, value: 12.6 },
        { nutrientId: 1005, value: 0.72 },
        { nutrientId: 1004, value: 9.5 },
        { nutrientId: 1079, value: 0 }
      ]
    },
    "bread toasted": {
      fdcId: 102,
      description: "Bread, toasted",
      servingSize: 28,
      servingSizeUnit: "g",
      householdServingFullText: "1 slice",
      foodNutrients: [
        { nutrientId: 1008, value: 265 },
        { nutrientId: 1003, value: 9 },
        { nutrientId: 1005, value: 49 },
        { nutrientId: 1004, value: 3.2 },
        { nutrientId: 1079, value: 2.7 }
      ]
    },
    "butter salted": {
      fdcId: 103,
      description: "Butter, salted",
      servingSize: 14,
      servingSizeUnit: "g",
      householdServingFullText: "1 tbsp",
      foodNutrients: [
        { nutrientId: 1008, value: 717 },
        { nutrientId: 1003, value: 0.9 },
        { nutrientId: 1005, value: 0.1 },
        { nutrientId: 1004, value: 81.1 },
        { nutrientId: 1079, value: 0 }
      ]
    }
  };
  const service = createNutritionService({
    useGenericReferences: false,
    fetchImpl: async (url, init) => {
      if (!String(url).includes("nal.usda.gov")) return jsonResponse({ products: [] });
      const query = JSON.parse(init.body).query.toLowerCase();
      return jsonResponse({ foods: [foods[query]] });
    }
  });

  const result = await service.resolveMeal(
    "I have eaten 4 eggs for breakfast and 2 slices of toast with butter today"
  );

  assert.equal(result.confidence, "verified");
  assert.equal(result.sourceType, "usda");
  assert.equal(result.components.length, 3);
  assert.equal(result.components[0].factor, 2);
  assert.equal(result.components[1].factor, 0.56);
  assert.equal(result.components[2].factor, 0.05);
  assert.equal(result.components[0].grams, 200);
  assert.equal(result.components[1].grams, 56);
  assert.equal(result.components[2].grams, 5);
  assert.equal(result.calories, 470.25);
  assert.equal(result.proteinGrams, 30.29);
  assert.equal(result.carbsGrams, 28.89);
  assert.equal(result.fatGrams, 24.85);
  assert.equal(result.fiberGrams, 1.51);
  assert.match(result.sourceId, /usda:101\+usda:102\+usda:103/);
});

test("parses conversational food requests when the eating phrase comes last", () => {
  assert.deepEqual(
    parseMealComponents("can u add 4 eggs and butter toast pls ive eaten"),
    {
      description: "4 eggs and toast with butter",
      components: [
        { amount: 4, unit: "item", query: "eggs", text: "4 eggs", kind: "egg" },
        { amount: 1, unit: "item", query: "toast", text: "toast", kind: "toast" },
        { amount: 1, unit: "item", query: "butter", text: "butter", kind: "butter" }
      ]
    }
  );
  assert.deepEqual(
    parseMealComponents("4 eggs and toast to what"),
    {
      description: "4 eggs and toast with butter",
      components: [
        { amount: 4, unit: "item", query: "eggs", text: "4 eggs", kind: "egg" },
        { amount: 1, unit: "item", query: "toast", text: "toast", kind: "toast" },
        { amount: 1, unit: "item", query: "butter", text: "butter", kind: "butter" }
      ]
    }
  );
  assert.deepEqual(
    parseMealComponents("4 eggs and toast with butter to what"),
    {
      description: "4 eggs and toast with butter",
      components: [
        { amount: 4, unit: "item", query: "eggs", text: "4 eggs", kind: "egg" },
        { amount: 1, unit: "item", query: "toast", text: "toast", kind: "toast" },
        { amount: 1, unit: "item", query: "butter", text: "butter", kind: "butter" }
      ]
    }
  );
});

test("rejects branded and implausible exact-name matches before aggregation", async () => {
  const goodFoods = {
    "egg whole cooked": {
      fdcId: 201,
      description: "Egg, whole, cooked",
      servingSize: 50,
      servingSizeUnit: "g",
      householdServingFullText: "1 large egg",
      foodNutrients: [
        { nutrientId: 1008, value: 143 },
        { nutrientId: 1003, value: 12.6 },
        { nutrientId: 1005, value: 0.72 },
        { nutrientId: 1004, value: 9.5 }
      ]
    },
    "bread toasted": {
      fdcId: 202,
      description: "Bread, white, toasted",
      servingSize: 28,
      servingSizeUnit: "g",
      householdServingFullText: "1 slice",
      foodNutrients: [
        { nutrientId: 1008, value: 265 },
        { nutrientId: 1003, value: 9 },
        { nutrientId: 1005, value: 49 },
        { nutrientId: 1004, value: 3.2 }
      ]
    },
    "butter salted": {
      fdcId: 203,
      description: "Butter, salted",
      servingSize: 14,
      servingSizeUnit: "g",
      householdServingFullText: "1 tbsp",
      foodNutrients: [
        { nutrientId: 1008, value: 717 },
        { nutrientId: 1003, value: 0.9 },
        { nutrientId: 1005, value: 0.1 },
        { nutrientId: 1004, value: 81.1 }
      ]
    }
  };
  const badFoods = {
    "egg whole cooked": {
      fdcId: 301,
      description: "EGGS",
      brandName: "SNICKERS",
      servingSize: 100,
      servingSizeUnit: "g",
      householdServingFullText: "1 EGG",
      foodNutrients: [
        { nutrientId: 1008, value: 525 },
        { nutrientId: 1003, value: 7.5 },
        { nutrientId: 1005, value: 60 },
        { nutrientId: 1004, value: 27.5 }
      ]
    },
    "bread toasted": {
      fdcId: 302,
      description: "Melba toast",
      foodNutrients: [
        { nutrientId: 1008, value: 390 },
        { nutrientId: 1003, value: 12.1 },
        { nutrientId: 1005, value: 76.6 },
        { nutrientId: 1004, value: 3.2 }
      ]
    },
    "butter salted": {
      fdcId: 303,
      description: "BUTTER",
      brandName: "EARTHBOUND FARM",
      servingSize: 85,
      servingSizeUnit: "g",
      foodNutrients: [
        { nutrientId: 1008, value: 12 },
        { nutrientId: 1003, value: 1 },
        { nutrientId: 1005, value: 2 },
        { nutrientId: 1004, value: 0 }
      ]
    }
  };
  const service = createNutritionService({
    useGenericReferences: false,
    fetchImpl: async (url, init) => {
      if (!String(url).includes("nal.usda.gov")) return jsonResponse({ products: [] });
      const query = JSON.parse(init.body).query.toLowerCase();
      return jsonResponse({ foods: [badFoods[query], goodFoods[query]] });
    }
  });

  const result = await service.resolveMeal("add 4 eggs and butter toast");

  assert.deepEqual(result.components.map((item) => item.sourceId), ["201", "202", "203"]);
  assert.ok(result.calories > 350 && result.calories < 500);
});

test("uses stable generic USDA references for common unbranded foods", async () => {
  const service = createNutritionService({
    fetchImpl: async () => {
      throw new Error("Common generic references should not require a network lookup.");
    }
  });

  const result = await service.resolveMeal(
    "better, 4 eggs and toast with butter to what"
  );

  assert.equal(result.name, "Eggs x4, toast with butter");
  assert.deepEqual(
    result.components.map((item) => [item.matchedName, item.grams]),
    [
      ["Egg, whole, cooked", 200],
      ["Bread, toasted", 28],
      ["Butter, salted", 5]
    ]
  );
  assert.equal(result.calories, 396.05);
  assert.equal(result.proteinGrams, 27.77);
  assert.equal(result.carbsGrams, 15.17);
  assert.equal(result.fatGrams, 23.96);
  assert.equal(result.fiberGrams, 0.76);

  const snack = await service.resolveMeal("i hjad apple and banana as snack today");
  assert.equal(snack.name, "Apple, banana");
  assert.deepEqual(
    snack.components.map((item) => [item.matchedName, item.grams]),
    [
      ["Apple, raw, with skin", 182],
      ["Banana, raw", 118]
    ]
  );
  assert.equal(snack.calories, 199.66);
  assert.equal(snack.proteinGrams, 1.76);
  assert.equal(snack.carbsGrams, 52.08);
  assert.equal(snack.fatGrams, 0.7);
  assert.equal(snack.fiberGrams, 7.44);
});

test("normalizes Open Food Facts serving nutrients and kilojoule fallback", () => {
  const result = normalizeOpenFoodFactsProduct({
    code: "00990011",
    product_name: "Oat Bar",
    brands: "Example Foods",
    serving_size: "1 bar (40 g)",
    serving_quantity: 40,
    nutriments: {
      "energy-kj_100g": 1673.6,
      proteins_100g: 10,
      carbohydrates_serving: 22,
      fat_100g: 15,
      fiber_100g: 8
    }
  });

  assert.equal(result.servingAmount, 40);
  assert.equal(result.servingUnit, "g");
  assert.equal(result.calories, 160);
  assert.equal(result.proteinGrams, 4);
  assert.equal(result.carbsGrams, 22);
  assert.equal(result.fatGrams, 6);
  assert.equal(result.fiberGrams, 3.2);
  assert.equal(result.sourceType, "open_food_facts");
  assert.match(result.sourceUrl, /00990011$/);
});

test("caches normalized searches and returns defensive copies", async () => {
  let calls = 0;
  const service = createNutritionService({
    apiKey: SECRET_KEY,
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes("nal.usda.gov")) {
        return jsonResponse({
          foods: [{
            fdcId: 1,
            description: "Apple",
            foodNutrients: [{ nutrientId: 1008, value: 52 }]
          }]
        });
      }
      return jsonResponse({
        products: [{
          code: "2",
          product_name: "Apple slices",
          nutriments: { "energy-kcal_100g": 50 }
        }]
      });
    }
  });

  const first = await service.search("  apple ");
  first[0].name = "mutated";
  const second = await service.search("APPLE");

  assert.equal(calls, 2);
  assert.equal(first.length, 2);
  assert.equal(second[0].name, "Apple");
});

test("enforces a hard timeout and redacts keys and upstream errors", async () => {
  const timeoutService = createNutritionService({
    apiKey: SECRET_KEY,
    timeoutMs: 20,
    fetchImpl: () => new Promise(() => {})
  });
  const startedAt = Date.now();
  await assert.rejects(
    timeoutService.search("banana"),
    (error) => {
      assert.equal(error.code, "TIMEOUT");
      assert.equal(error.message.includes(SECRET_KEY), false);
      return true;
    }
  );
  assert.ok(Date.now() - startedAt < 500);

  const failingService = createNutritionService({
    apiKey: SECRET_KEY,
    fetchImpl: async (url) => {
      throw new Error(`request failed for ${url}: ${SECRET_KEY}`);
    }
  });
  await assert.rejects(
    failingService.search("banana"),
    (error) => {
      const response = nutritionFailure(error);
      assert.deepEqual(response, {
        ok: false,
        code: "SERVICE_UNAVAILABLE",
        error: "Nutrition lookup is temporarily unavailable. Please try again.",
        results: []
      });
      assert.equal(JSON.stringify(response).includes(SECRET_KEY), false);
      return true;
    }
  );
});
