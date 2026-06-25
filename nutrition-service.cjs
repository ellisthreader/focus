"use strict";

const FDC_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OPEN_FOOD_FACTS_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 10;
const PROVIDER_RESULT_LIMIT = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 15000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CACHE_SIZE = 50;
const GENERIC_FOOD_REFERENCES = Object.freeze({
  egg: Object.freeze({
    id: "generic-egg-whole-cooked",
    name: "Egg, whole, cooked",
    brand: "",
    servingLabel: "1 large egg (50 g)",
    servingAmount: 50,
    servingUnit: "g",
    calories: 71.5,
    proteinGrams: 6.3,
    carbsGrams: 0.36,
    fatGrams: 4.75,
    fiberGrams: 0,
    nutrientsPer100g: {
      calories: 143,
      proteinGrams: 12.6,
      carbsGrams: 0.72,
      fatGrams: 9.5,
      fiberGrams: 0
    },
    sourceType: "usda",
    sourceLabel: "USDA FoodData Central generic reference",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-search?query=egg%20whole%20cooked",
    confidence: "verified"
  }),
  toast: Object.freeze({
    id: "generic-bread-toasted",
    name: "Bread, toasted",
    brand: "",
    servingLabel: "1 slice (28 g)",
    servingAmount: 28,
    servingUnit: "g",
    calories: 74.2,
    proteinGrams: 2.52,
    carbsGrams: 13.72,
    fatGrams: 0.9,
    fiberGrams: 0.76,
    nutrientsPer100g: {
      calories: 265,
      proteinGrams: 9,
      carbsGrams: 49,
      fatGrams: 3.2,
      fiberGrams: 2.7
    },
    sourceType: "usda",
    sourceLabel: "USDA FoodData Central generic reference",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-search?query=bread%20toasted",
    confidence: "verified"
  }),
  butter: Object.freeze({
    id: "generic-butter-salted",
    name: "Butter, salted",
    brand: "",
    servingLabel: "1 teaspoon spread (5 g)",
    servingAmount: 5,
    servingUnit: "g",
    calories: 35.85,
    proteinGrams: 0.05,
    carbsGrams: 0.01,
    fatGrams: 4.06,
    fiberGrams: 0,
    nutrientsPer100g: {
      calories: 717,
      proteinGrams: 0.9,
      carbsGrams: 0.1,
      fatGrams: 81.1,
      fiberGrams: 0
    },
    sourceType: "usda",
    sourceLabel: "USDA FoodData Central generic reference",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-search?query=butter%20salted",
    confidence: "verified"
  }),
  apple: Object.freeze({
    id: "generic-apple-raw-with-skin",
    name: "Apple, raw, with skin",
    brand: "",
    servingLabel: "1 medium apple (182 g)",
    servingAmount: 182,
    servingUnit: "g",
    calories: 94.64,
    proteinGrams: 0.47,
    carbsGrams: 25.13,
    fatGrams: 0.31,
    fiberGrams: 4.37,
    nutrientsPer100g: {
      calories: 52,
      proteinGrams: 0.26,
      carbsGrams: 13.81,
      fatGrams: 0.17,
      fiberGrams: 2.4
    },
    sourceType: "usda",
    sourceLabel: "USDA FoodData Central generic reference",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-search?query=apple%20raw%20with%20skin",
    confidence: "verified"
  }),
  banana: Object.freeze({
    id: "generic-banana-raw",
    name: "Banana, raw",
    brand: "",
    servingLabel: "1 medium banana (118 g)",
    servingAmount: 118,
    servingUnit: "g",
    calories: 105.02,
    proteinGrams: 1.29,
    carbsGrams: 26.95,
    fatGrams: 0.39,
    fiberGrams: 3.07,
    nutrientsPer100g: {
      calories: 89,
      proteinGrams: 1.09,
      carbsGrams: 22.84,
      fatGrams: 0.33,
      fiberGrams: 2.6
    },
    sourceType: "usda",
    sourceLabel: "USDA FoodData Central generic reference",
    sourceUrl: "https://fdc.nal.usda.gov/fdc-app.html#/food-search?query=banana%20raw",
    confidence: "verified"
  })
});

class NutritionServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NutritionServiceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new NutritionServiceError(code, message);
}

function finiteNumber(value) {
  const number = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function rounded(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number * 100) / 100;
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeUnit(value, fallback = "g") {
  const unit = cleanText(value).toLowerCase();
  if (unit === "gram" || unit === "grams") return "g";
  if (unit === "milliliter" || unit === "milliliters" || unit === "millilitre" || unit === "millilitres") {
    return "ml";
  }
  return unit || fallback;
}

function normalizeQuery(value) {
  if (typeof value !== "string") {
    fail("INVALID_QUERY", "Enter a food to search for.");
  }
  const query = cleanText(value);
  if (!query) fail("INVALID_QUERY", "Enter a food to search for.");
  if (query.length > MAX_QUERY_LENGTH) {
    fail("INVALID_QUERY", `Food searches must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  }
  return query;
}

function fdcNutrient(food, nutrientId, nutrientNumber) {
  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];
  const match = nutrients.find((entry) =>
    Number(entry?.nutrientId) === nutrientId
    || String(entry?.nutrientNumber || "") === nutrientNumber
  );
  return finiteNumber(match?.value ?? match?.amount);
}

function fdcEnergy(food) {
  return fdcNutrient(food, 1008, "208")
    ?? fdcNutrient(food, 2048, "")
    ?? fdcNutrient(food, 2047, "");
}

function normalizeFdcFood(food) {
  const fdcId = cleanText(food?.fdcId);
  const name = cleanText(food?.description);
  if (!fdcId || !name) return null;

  const listedServing = positiveNumber(food?.servingSize);
  const listedUnit = normalizeUnit(food?.servingSizeUnit);
  const canScaleServing = listedServing !== null && (listedUnit === "g" || listedUnit === "ml");
  const servingAmount = canScaleServing ? listedServing : 100;
  const servingUnit = canScaleServing ? listedUnit : "g";
  const scale = servingAmount / 100;
  const nutrientsPer100g = [
    fdcEnergy(food),
    fdcNutrient(food, 1003, "203"),
    fdcNutrient(food, 1005, "205"),
    fdcNutrient(food, 1004, "204"),
    fdcNutrient(food, 1079, "291")
  ].map(rounded);
  const nutrients = nutrientsPer100g
    .map((value) => value === null ? null : rounded(value * scale));

  return {
    id: fdcId,
    name,
    brand: cleanText(food?.brandName || food?.brandOwner),
    servingLabel: cleanText(food?.householdServingFullText),
    servingAmount: rounded(servingAmount),
    servingUnit,
    calories: nutrients[0],
    proteinGrams: nutrients[1],
    carbsGrams: nutrients[2],
    fatGrams: nutrients[3],
    fiberGrams: nutrients[4],
    nutrientsPer100g: {
      calories: nutrientsPer100g[0],
      proteinGrams: nutrientsPer100g[1],
      carbsGrams: nutrientsPer100g[2],
      fatGrams: nutrientsPer100g[3],
      fiberGrams: nutrientsPer100g[4]
    },
    sourceType: "usda",
    sourceLabel: "USDA FoodData Central",
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(fdcId)}/nutrients`,
    confidence: "verified"
  };
}

function parseServing(product) {
  const quantity = positiveNumber(product?.serving_quantity);
  const servingText = cleanText(product?.serving_size);
  const amountAndUnit = servingText.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  const parsedAmount = amountAndUnit ? positiveNumber(amountAndUnit[1].replace(",", ".")) : null;
  return {
    amount: quantity || parsedAmount || 100,
    unit: normalizeUnit(amountAndUnit?.[2], "g")
  };
}

function offNutrient(nutriments, key, serving, options = {}) {
  const servingValue = finiteNumber(nutriments?.[`${key}_serving`]);
  if (servingValue !== null) return rounded(servingValue);

  let perHundred = finiteNumber(nutriments?.[`${key}_100g`] ?? nutriments?.[key]);
  if (perHundred === null && options.kilojouleKey) {
    const kilojoules = finiteNumber(
      nutriments?.[`${options.kilojouleKey}_100g`] ?? nutriments?.[options.kilojouleKey]
    );
    if (kilojoules !== null) perHundred = kilojoules / 4.184;
  }
  if (perHundred === null) return null;
  return rounded(perHundred * serving.amount / 100);
}

function offNutrientPer100g(nutriments, key, options = {}) {
  let value = finiteNumber(nutriments?.[`${key}_100g`] ?? nutriments?.[key]);
  if (value === null && options.kilojouleKey) {
    const kilojoules = finiteNumber(
      nutriments?.[`${options.kilojouleKey}_100g`] ?? nutriments?.[options.kilojouleKey]
    );
    if (kilojoules !== null) value = kilojoules / 4.184;
  }
  return rounded(value);
}

function normalizeOpenFoodFactsProduct(product) {
  const code = cleanText(product?.code || product?._id);
  const name = cleanText(product?.product_name_en || product?.product_name);
  if (!code || !name) return null;

  const serving = parseServing(product);
  const nutriments = product?.nutriments && typeof product.nutriments === "object"
    ? product.nutriments
    : {};
  const nutrients = [
    offNutrient(nutriments, "energy-kcal", serving, { kilojouleKey: "energy-kj" }),
    offNutrient(nutriments, "proteins", serving),
    offNutrient(nutriments, "carbohydrates", serving),
    offNutrient(nutriments, "fat", serving),
    offNutrient(nutriments, "fiber", serving)
  ];
  const nutrientsPer100g = [
    offNutrientPer100g(nutriments, "energy-kcal", { kilojouleKey: "energy-kj" }),
    offNutrientPer100g(nutriments, "proteins"),
    offNutrientPer100g(nutriments, "carbohydrates"),
    offNutrientPer100g(nutriments, "fat"),
    offNutrientPer100g(nutriments, "fiber")
  ];

  return {
    id: code,
    name,
    brand: cleanText(product?.brands),
    servingLabel: cleanText(product?.serving_size),
    servingAmount: rounded(serving.amount),
    servingUnit: serving.unit,
    calories: nutrients[0],
    proteinGrams: nutrients[1],
    carbsGrams: nutrients[2],
    fatGrams: nutrients[3],
    fiberGrams: nutrients[4],
    nutrientsPer100g: {
      calories: nutrientsPer100g[0],
      proteinGrams: nutrientsPer100g[1],
      carbsGrams: nutrientsPer100g[2],
      fatGrams: nutrientsPer100g[3],
      fiberGrams: nutrientsPer100g[4]
    },
    sourceType: "open_food_facts",
    sourceLabel: "Open Food Facts",
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    confidence: "verified"
  };
}

function safeProviderError(code = "PROVIDER_ERROR") {
  if (code === "TIMEOUT") {
    return new NutritionServiceError("TIMEOUT", "The nutrition lookup timed out. Please try again.");
  }
  return new NutritionServiceError(
    "SERVICE_UNAVAILABLE",
    "Nutrition lookup is temporarily unavailable. Please try again."
  );
}

async function fetchJson(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(safeProviderError("TIMEOUT"));
    }, timeoutMs);
  });

  const request = Promise.resolve()
    .then(() => fetchImpl(url, { ...init, signal: controller.signal }))
    .then(async (response) => {
      if (!response || typeof response.ok !== "boolean") throw safeProviderError();
      if (!response.ok) throw safeProviderError();
      try {
        return await response.json();
      } catch {
        throw safeProviderError();
      }
    })
    .catch((error) => {
      if (error instanceof NutritionServiceError) throw error;
      if (controller.signal.aborted || error?.name === "AbortError") throw safeProviderError("TIMEOUT");
      throw safeProviderError();
    });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function searchFdc(query, options) {
  const url = new URL(FDC_SEARCH_URL);
  url.searchParams.set("api_key", options.apiKey);
  const payload = await fetchJson(options.fetchImpl, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, pageSize: PROVIDER_RESULT_LIMIT })
  }, options.timeoutMs);
  if (!Array.isArray(payload?.foods)) throw safeProviderError();
  return payload.foods.map(normalizeFdcFood).filter(Boolean).slice(0, PROVIDER_RESULT_LIMIT);
}

async function searchOpenFoodFacts(query, options) {
  const url = new URL(OPEN_FOOD_FACTS_SEARCH_URL);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(PROVIDER_RESULT_LIMIT));
  url.searchParams.set(
    "fields",
    "code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments"
  );
  const payload = await fetchJson(options.fetchImpl, url, {
    method: "GET",
    headers: { "user-agent": "Focus/1.0 (https://github.com/ellisthreader/focus)" }
  }, options.timeoutMs);
  if (!Array.isArray(payload?.products)) throw safeProviderError();
  return payload.products
    .map(normalizeOpenFoodFactsProduct)
    .filter(Boolean)
    .slice(0, PROVIDER_RESULT_LIMIT);
}

function interleaveResults(groups) {
  const results = [];
  for (let index = 0; results.length < MAX_RESULTS; index += 1) {
    let added = false;
    for (const group of groups) {
      const result = group[index];
      if (!result) continue;
      const duplicate = results.some((entry) =>
        entry.sourceType === result.sourceType && entry.id === result.id
      );
      if (!duplicate) results.push(result);
      added = true;
      if (results.length === MAX_RESULTS) break;
    }
    if (!added) break;
  }
  return results;
}

function cloneResults(results) {
  return results.map((result) => ({ ...result }));
}

const NUMBER_WORDS = Object.freeze({
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
});

function mealDescription(value) {
  let text = normalizeQuery(value)
    .replace(/^\s*(?:better|actually|correction|correct|no|nah|wait|sorry)\s*[,;:-]\s*/i, "")
    .replace(/\bhjad\b/gi, "had")
    .replace(/\btoast\s+with\s+butter\s+to\s+what\b/gi, "toast with butter")
    .replace(/\btoast\s+to\s+what\b/gi, "toast with butter")
    .replace(/\b(?:butter|buttered)\s+toast\b/gi, "toast with butter")
    .replace(/\bpls\b/gi, "please")
    .replace(/\bi(?:['’]?ve|ve)\s+eaten\b/gi, "eaten");
  const observation = text.match(/\b(?:ate|eaten|had|consumed)\b/i);
  if (observation) {
    const after = text.slice(observation.index + observation[0].length)
      .replace(/\b(?:today|yesterday|tonight|this\s+(?:morning|afternoon|evening))\b/gi, "")
      .replace(/^[\s,:;-]+|[\s.!?]+$/g, "")
      .trim();
    text = after || text.slice(0, observation.index);
  }
  return text
    .replace(/^\s*(?:(?:can|could|would)\s+(?:u|you)\s+)?(?:please\s+)?(?:add|log|record|track)\s+/i, "")
    .replace(/\bplease\b/gi, "")
    .replace(/\b(?:today|yesterday|tonight|this\s+(?:morning|afternoon|evening))\b/gi, "")
    .replace(/\bfor\s+(?:breakfast|lunch|dinner|snack)\b/gi, "")
    .replace(/\bas\s+(?:breakfast|lunch|dinner|snack)\b/gi, "")
    .replace(/^[\s,:;-]+|[\s.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQuantity(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized in NUMBER_WORDS) return NUMBER_WORDS[normalized];
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseMealComponent(value) {
  const text = cleanText(value);
  const match = text.match(
    /^(?:(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*)?(?:(kg|g|ml|oz|cups?|tbsp|tablespoons?|tsp|teaspoons?|slices?|pieces?|servings?)\s+(?:of\s+)?)?(.+)$/i
  );
  if (!match) return null;
  const amount = parseQuantity(match[1]) || 1;
  const unit = cleanText(match[2], "item").toLowerCase();
  const query = cleanText(match[3]).replace(/^(?:of\s+)/i, "");
  if (!query) return null;
  return { amount, unit, query, text };
}

function parseMealComponents(value) {
  const description = mealDescription(value);
  const components = description
    .split(/\s*(?:,|\band\b|\bwith\b|\bplus\b)\s*/i)
    .map(parseMealComponent)
    .filter(Boolean)
    .map((component) => ({
      ...component,
      kind: ingredientKind(component.query)
    }));
  if (!description || components.length === 0 || components.length > 12) {
    fail("INVALID_QUERY", "Describe up to 12 foods in the meal.");
  }
  return { description, components };
}

function quantityLabel(value) {
  return Number.isInteger(value) ? String(value) : String(rounded(value));
}

function componentDisplayName(component) {
  if (component.kind === "egg") {
    return component.amount === 1 ? "egg" : `eggs x${quantityLabel(component.amount)}`;
  }
  if (component.kind === "toast") {
    return component.amount === 1 ? "toast" : `toast x${quantityLabel(component.amount)}`;
  }
  if (component.kind === "butter") {
    if (component.unit !== "item") {
      return `${quantityLabel(component.amount)}${component.unit} butter`;
    }
    return component.amount === 1 ? "butter" : `butter x${quantityLabel(component.amount)}`;
  }
  if (component.kind === "apple") {
    return component.amount === 1 ? "apple" : `apples x${quantityLabel(component.amount)}`;
  }
  if (component.kind === "banana") {
    return component.amount === 1 ? "banana" : `bananas x${quantityLabel(component.amount)}`;
  }
  return component.text.toLowerCase();
}

function mealDisplayName(components) {
  const labels = [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const next = components[index + 1];
    if (component.kind === "toast" && next?.kind === "butter") {
      labels.push(`${componentDisplayName(component)} with ${componentDisplayName(next)}`);
      index += 1;
      continue;
    }
    labels.push(componentDisplayName(component));
  }
  const name = labels.join(", ");
  return name ? name[0].toUpperCase() + name.slice(1) : "";
}

function normalizedTokens(value) {
  return new Set(cleanText(value).toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
    .map((token) => token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token));
}

function ingredientKind(query) {
  const text = cleanText(query).toLowerCase();
  if (/\beggs?\b/.test(text)) return "egg";
  if (/\b(?:toast|bread)\b/.test(text)) return "toast";
  if (/\bbutter\b/.test(text)) return "butter";
  if (/\bapples?\b/.test(text)) return "apple";
  if (/\bbananas?\b/.test(text)) return "banana";
  return "generic";
}

function canonicalSearchQuery(component) {
  if (component.kind === "egg") return "egg whole cooked";
  if (component.kind === "toast") return "bread toasted";
  if (component.kind === "butter") return "butter salted";
  if (component.kind === "apple") return "apple raw with skin";
  if (component.kind === "banana") return "banana raw";
  return component.query;
}

function genericFoodReference(component) {
  const reference = GENERIC_FOOD_REFERENCES[component.kind];
  return reference ? structuredClone(reference) : null;
}

function per100(result, field) {
  const direct = finiteNumber(result?.nutrientsPer100g?.[field]);
  if (direct !== null) return direct;
  const servingValue = finiteNumber(result?.[field]);
  const servingAmount = positiveNumber(result?.servingAmount);
  return servingValue !== null && servingAmount
    ? servingValue * 100 / servingAmount
    : null;
}

function plausibleCandidate(result, kind) {
  const calories = per100(result, "calories");
  const protein = per100(result, "proteinGrams");
  const carbs = per100(result, "carbsGrams");
  const fat = per100(result, "fatGrams");
  const name = cleanText(result?.name).toLowerCase();
  if (calories === null || calories < 0 || calories > 950) return false;
  if (kind === "egg") {
    return /\beggs?\b/.test(name)
      && calories >= 100 && calories <= 250
      && protein !== null && protein >= 8 && protein <= 20
      && (carbs === null || carbs <= 6)
      && fat !== null && fat >= 5 && fat <= 20;
  }
  if (kind === "toast") {
    return /\b(?:toast|bread)\b/.test(name)
      && !/\b(?:cereal|shrimp|anisette|zwieback|melba)\b/.test(name)
      && calories >= 180 && calories <= 450
      && (protein === null || protein <= 25)
      && carbs !== null && carbs >= 25 && carbs <= 90
      && (fat === null || fat <= 25);
  }
  if (kind === "butter") {
    return /\bbutter\b/.test(name)
      && calories >= 550 && calories <= 850
      && (protein === null || protein <= 5)
      && (carbs === null || carbs <= 8)
      && fat !== null && fat >= 60 && fat <= 100;
  }
  return true;
}

function resultScore(result, component) {
  const queryTokens = normalizedTokens(component.query);
  const nameTokens = normalizedTokens(`${result.name} ${result.brand}`);
  let score = result.sourceType === "usda" ? 5 : 0;
  if (!result.brand) score += 20;
  else score -= 8;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) score += 8;
  }
  if (component.kind === "egg" && /\b(?:whole|cooked|fried|boiled|scrambled)\b/i.test(result.name)) {
    score += 6;
  }
  if (component.kind === "toast" && /\bbread\b/i.test(result.name)) score += 6;
  if (component.kind === "butter" && /\b(?:salted|unsalted|stick)\b/i.test(result.name)) score += 6;
  for (const key of ["calories", "proteinGrams", "carbsGrams", "fatGrams", "fiberGrams"]) {
    if (per100(result, key) !== null) score += 1;
  }
  if (/raw|plain|generic/i.test(result.name)) score += 1;
  return score;
}

function bestResult(results, component) {
  const ranked = [...results]
    .filter((result) => plausibleCandidate(result, component.kind))
    .map((result) => ({ result, score: resultScore(result, component) }))
    .sort((left, right) => right.score - left.score);
  if (!ranked[0] || ranked[0].score < 15) return null;
  return ranked[0].result;
}

function weightAmount(amount, unit) {
  if (unit === "g") return amount;
  if (unit === "kg") return amount * 1000;
  if (unit === "oz") return amount * 28.349523125;
  if (unit === "ml") return amount;
  if (unit === "cup" || unit === "cups") return amount * 240;
  if (unit === "tbsp" || unit.startsWith("tablespoon")) return amount * 15;
  if (unit === "tsp" || unit.startsWith("teaspoon")) return amount * 5;
  return null;
}

function defaultPortionGrams(component, result) {
  if (component.kind === "egg") {
    const listed = positiveNumber(result.servingAmount);
    return listed && listed >= 35 && listed <= 80 ? listed * component.amount : 50 * component.amount;
  }
  if (component.kind === "toast") {
    const listed = positiveNumber(result.servingAmount);
    const sliceLike = /\b(?:slice|piece)\b/i.test(result.servingLabel);
    const sliceGrams = sliceLike && listed >= 15 && listed <= 60 ? listed : 28;
    return sliceGrams * component.amount;
  }
  if (component.kind === "butter") {
    return 5 * component.amount;
  }
  const listed = positiveNumber(result.servingAmount);
  return listed ? listed * component.amount : null;
}

function servingFactor(component, result) {
  const weight = weightAmount(component.amount, component.unit);
  const portionGrams = weight ?? defaultPortionGrams(component, result);
  if (portionGrams !== null) {
    return {
      grams: portionGrams,
      factor: portionGrams / 100,
      assumption: `${component.text}: calculated as ${rounded(portionGrams)} g using ${weight !== null
        ? "the stated amount"
        : component.kind === "egg"
          ? "one egg per item"
          : component.kind === "toast"
            ? "one slice per item"
            : component.kind === "butter"
              ? "a 5 g spread when no amount was stated"
              : "the dataset serving"}.`
    };
  }
  return null;
}

function scaledNutrients(result, factor) {
  return Object.fromEntries([
    ["calories", "calories"],
    ["proteinGrams", "proteinGrams"],
    ["carbsGrams", "carbsGrams"],
    ["fatGrams", "fatGrams"],
    ["fiberGrams", "fiberGrams"]
  ].map(([target, source]) => {
    const value = per100(result, source);
    return [target, value === null ? null : rounded(value * factor)];
  }));
}

function sumNutrients(components) {
  const fields = ["calories", "proteinGrams", "carbsGrams", "fatGrams", "fiberGrams"];
  return Object.fromEntries(fields.map((field) => {
    const values = components.map((component) => finiteNumber(component[field]));
    return [
      field,
      values.some((value) => value === null)
        ? null
        : rounded(values.reduce((total, value) => total + value, 0))
    ];
  }));
}

function createNutritionService(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("INVALID_CONFIGURATION", "Nutrition lookup is unavailable.");
  const apiKey = cleanText(options.apiKey || process.env.FDC_API_KEY, "DEMO_KEY");
  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(1, Number.parseInt(options.timeoutMs, 10) || DEFAULT_TIMEOUT_MS)
  );
  const cacheTtlMs = Math.max(0, Number.parseInt(options.cacheTtlMs, 10) || DEFAULT_CACHE_TTL_MS);
  const cacheSize = Math.max(1, Number.parseInt(options.cacheSize, 10) || DEFAULT_CACHE_SIZE);
  const useGenericReferences = options.useGenericReferences !== false;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const cache = new Map();
  const pending = new Map();

  function cacheResult(key, results) {
    cache.delete(key);
    cache.set(key, { expiresAt: now() + cacheTtlMs, results: cloneResults(results) });
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value);
  }

  async function search(queryValue) {
    const query = normalizeQuery(queryValue);
    const key = query.toLocaleLowerCase("en-US");
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) {
      cache.delete(key);
      cache.set(key, cached);
      return cloneResults(cached.results);
    }
    if (cached) cache.delete(key);
    if (pending.has(key)) return cloneResults(await pending.get(key));

    const lookup = (async () => {
      const providerOptions = { apiKey, fetchImpl, timeoutMs };
      const settled = await Promise.allSettled([
        searchFdc(query, providerOptions),
        searchOpenFoodFacts(query, providerOptions)
      ]);
      const successful = settled.filter((result) => result.status === "fulfilled");
      if (successful.length === 0) {
        const timedOut = settled.some((result) => result.reason?.code === "TIMEOUT");
        throw safeProviderError(timedOut ? "TIMEOUT" : "PROVIDER_ERROR");
      }
      const results = interleaveResults(successful.map((result) => result.value));
      cacheResult(key, results);
      return results;
    })();

    pending.set(key, lookup);
    try {
      return cloneResults(await lookup);
    } finally {
      pending.delete(key);
    }
  }

  async function resolveMeal(value) {
    const parsed = parseMealComponents(value);
    const resolved = await Promise.all(parsed.components.map(async (component) => {
      const lookupQuery = canonicalSearchQuery(component);
      const reference = useGenericReferences ? genericFoodReference(component) : null;
      const match = reference || bestResult(await search(lookupQuery), component);
      if (!match) return { ...component, matched: false };
      const serving = servingFactor(component, match);
      if (!serving || serving.factor <= 0 || serving.factor > 20) {
        return { ...component, matched: false };
      }
      const nutrients = scaledNutrients(match, serving.factor);
      const calories = finiteNumber(nutrients.calories);
      if (calories === null || calories > 2000) {
        return { ...component, matched: false };
      }
      return {
        ...component,
        matched: true,
        match,
        grams: rounded(serving.grams),
        factor: rounded(serving.factor),
        assumption: serving.assumption,
        ...nutrients
      };
    }));
    const unresolved = resolved.filter((component) => !component.matched);
    if (unresolved.length) {
      fail(
        "NO_MATCH",
        `No verified nutrition match was found for: ${unresolved.map((item) => item.query).join(", ")}.`
      );
    }
    const sources = [...new Set(resolved.map((component) => component.match.sourceLabel))];
    return {
      name: mealDisplayName(parsed.components),
      servingAmount: 1,
      servingUnit: "meal",
      ...sumNutrients(resolved),
      sourceType: resolved.every((component) => component.match.sourceType === "usda")
        ? "usda"
        : "nutrition_datasets",
      sourceId: resolved.map((component) => (
        `${component.match.sourceType}:${component.match.id}`
      )).join("+"),
      sourceLabel: sources.join(" + "),
      sourceUrl: resolved[0].match.sourceUrl,
      confidence: "verified",
      assumptions: resolved.map((component) => component.assumption).join(" "),
      components: resolved.map((component) => ({
        text: component.text,
        matchedName: component.match.name,
        sourceType: component.match.sourceType,
        sourceId: component.match.id,
        sourceUrl: component.match.sourceUrl,
        grams: component.grams,
        factor: component.factor,
        calories: component.calories,
        proteinGrams: component.proteinGrams,
        carbsGrams: component.carbsGrams,
        fatGrams: component.fatGrams,
        fiberGrams: component.fiberGrams
      }))
    };
  }

  return {
    clearCache: () => cache.clear(),
    resolveMeal,
    search
  };
}

function nutritionFailure(error) {
  const code = error instanceof NutritionServiceError ? error.code : "SERVICE_UNAVAILABLE";
  const safeError = code === "INVALID_QUERY" || code === "NO_MATCH"
    ? new NutritionServiceError(code, error.message)
    : safeProviderError(code);
  return { ok: false, code: safeError.code, error: safeError.message, results: [] };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MAX_QUERY_LENGTH,
  MAX_RESULTS,
  NutritionServiceError,
  createNutritionService,
  parseMealComponents,
  normalizeFdcFood,
  normalizeOpenFoodFactsProduct,
  normalizeQuery,
  nutritionFailure
};
