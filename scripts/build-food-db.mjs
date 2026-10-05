#!/usr/bin/env node
/**
 * Build assets/data/foods.json from USDA FoodData Central API.
 *
 * Requires FDC_API_KEY in .env (see .env.example) or the environment.
 *
 * Usage:
 *   node scripts/build-food-db.mjs                  # Foundation + SR Legacy (default)
 *   node scripts/build-food-db.mjs --survey          # also FNDDS
 *   node scripts/build-food-db.mjs --branded --max=N # branded (labelNutrients)
 *   node scripts/build-food-db.mjs --debug
 *
 * Important USDA constraints handled here:
 * - Do NOT request >25 nutrient IDs in a filter (API rejects). We fetch without
 *   nutrient filters and map ~31 nutrients client-side.
 * - Branded: prefer labelNutrients (per serving); set nutrition_basis accordingly.
 * - Energy IDs: 1008, 2047, 2048 (kcal); 1062 (kJ → kcal).
 * - Batches of 12 with retry backoff 3/6/9/12/15s on 504 / timeouts.
 * - Skip foods with no usable energy; report skip counts.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
loadDotenv({ path: join(ROOT, ".env") });

const OUT_JSON = join(ROOT, "assets/data/foods.json");
const API_BASE = "https://api.nal.usda.gov/fdc/v1";
const BATCH_SIZE = 12;
const PAGE_SIZE = 200;
const BACKOFF_S = [3, 6, 9, 12, 15];

const args = process.argv.slice(2);
const includeSurvey = args.includes("--survey");
const includeBranded = args.includes("--branded");
const debug = args.includes("--debug");
const maxArg = args.find((a) => a.startsWith("--max="));
const maxFoods = maxArg ? Number(maxArg.split("=")[1]) : Infinity;

/** nutrientId → our key. Mapped client-side; never sent as >25 filter IDs. */
const NUTRIENT_ID_MAP = {
  1008: "calories", // Energy (kcal)
  2047: "calories", // Energy Atwater General
  2048: "calories", // Energy Atwater Specific
  // 1062 handled specially (kJ)
  1003: "protein",
  1004: "fat",
  1005: "carb",
  1079: "fiber",
  2000: "sugars",
  1235: "sugars", // Sugars, total (legacy)
  1258: "saturated_fat",
  1257: "trans_fat",
  1253: "cholesterol",
  1093: "sodium",
  1092: "potassium",
  1087: "calcium",
  1089: "iron",
  1090: "magnesium",
  1091: "phosphorus",
  1095: "zinc",
  1098: "copper",
  1101: "manganese",
  1103: "selenium",
  1162: "vitamin_c",
  1165: "thiamin",
  1166: "riboflavin",
  1167: "niacin",
  1170: "pantothenic_acid",
  1175: "vitamin_b6",
  1177: "folate",
  1186: "folate", // Folate, DFE
  1178: "vitamin_b12",
  1106: "vitamin_a", // Vitamin A, RAE
  1114: "vitamin_d",
  1110: "vitamin_d", // Vitamin D (IU) — only if no 1114
  1109: "vitamin_e",
  1185: "vitamin_k",
};

const LABEL_NUTRIENT_MAP = {
  calories: "calories",
  protein: "protein",
  fat: "fat",
  carbohydrates: "carb",
  fiber: "fiber",
  sugars: "sugars",
  saturatedFat: "saturated_fat",
  transFat: "trans_fat",
  cholesterol: "cholesterol",
  sodium: "sodium",
  potassium: "potassium",
  calcium: "calcium",
  iron: "iron",
};

const NUTRIENT_KEYS = [
  "calories",
  "protein",
  "fat",
  "carb",
  "fiber",
  "sugars",
  "saturated_fat",
  "trans_fat",
  "cholesterol",
  "sodium",
  "potassium",
  "calcium",
  "iron",
  "magnesium",
  "phosphorus",
  "zinc",
  "copper",
  "manganese",
  "selenium",
  "vitamin_c",
  "thiamin",
  "riboflavin",
  "niacin",
  "pantothenic_acid",
  "vitamin_b6",
  "folate",
  "vitamin_b12",
  "vitamin_a",
  "vitamin_d",
  "vitamin_e",
  "vitamin_k",
];

const DATA_TYPE_SOURCE = {
  Foundation: "foundation",
  "SR Legacy": "sr_legacy",
  "Survey (FNDDS)": "survey",
  Branded: "branded",
};

function emptyNutrients() {
  const n = {};
  for (const k of NUTRIENT_KEYS) n[k] = null;
  return n;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(...parts) {
  console.log(...parts);
}

function debugLog(...parts) {
  if (debug) console.log("[debug]", ...parts);
}

async function fetchWithRetry(url, options = {}, label = "request") {
  let lastErr;
  for (let attempt = 0; attempt <= BACKOFF_S.length; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let res;
      try {
        res = await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 504 || res.status === 502 || res.status === 503) {
        throw Object.assign(new Error(`HTTP ${res.status}`), {
          retryable: true,
          status: res.status,
        });
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status} ${label}: ${body.slice(0, 200)}`);
        err.status = res.status;
        err.retryable = res.status === 429;
        throw err;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const retryable =
        err.retryable ||
        err.name === "AbortError" ||
        /timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(String(err.message));
      if (!retryable || attempt === BACKOFF_S.length) throw err;
      const wait = BACKOFF_S[attempt];
      console.warn(
        `  retry ${label} after ${err.message || err} → wait ${wait}s (attempt ${attempt + 1})`
      );
      await sleep(wait * 1000);
    }
  }
  throw lastErr;
}

function mapFoodNutrients(foodNutrients = []) {
  const nutrients = emptyNutrients();
  let kj = null;
  // Prefer primary kcal IDs; fill others only if null
  const priority = { 1008: 3, 2048: 2, 2047: 1 };
  let calPriority = -1;

  for (const fn of foodNutrients) {
    const id = fn.nutrientId ?? fn.nutrient?.id;
    const amount =
      fn.amount ?? fn.value ?? fn.nutrientNumber ?? null;
    if (id == null || amount == null || Number.isNaN(Number(amount))) continue;
    const num = Number(amount);

    if (id === 1062) {
      kj = num;
      continue;
    }
    const key = NUTRIENT_ID_MAP[id];
    if (!key) continue;

    if (key === "calories") {
      const p = priority[id] ?? 0;
      if (p >= calPriority) {
        nutrients.calories = num;
        calPriority = p;
      }
      continue;
    }
    // Prefer first non-null; for folate prefer 1177 then 1186 already ordered by encounter
    if (nutrients[key] == null) nutrients[key] = num;
  }

  if (nutrients.calories == null && kj != null) {
    nutrients.calories = Math.round((kj / 4.184) * 100) / 100;
  }
  return nutrients;
}

function mapLabelNutrients(labelNutrients = {}) {
  const nutrients = emptyNutrients();
  for (const [lk, ourKey] of Object.entries(LABEL_NUTRIENT_MAP)) {
    const entry = labelNutrients[lk];
    if (entry == null) continue;
    const val = typeof entry === "object" ? entry.value : entry;
    if (val == null || Number.isNaN(Number(val))) continue;
    nutrients[ourKey] = Number(val);
  }
  return nutrients;
}

function pickServing(food) {
  // Prefer household serving; fall back to 100g for per_100g foods
  const ss = food.servingSize;
  const su = food.servingSizeUnit;
  if (ss != null && su) return { serving_size: Number(ss), serving_unit: String(su) };

  const portions = food.foodPortions || [];
  if (portions.length) {
    const p = portions.find((x) => x.gramWeight) || portions[0];
    if (p.gramWeight != null) {
      return {
        serving_size: Number(p.gramWeight),
        serving_unit: "g",
      };
    }
  }
  return { serving_size: 100, serving_unit: "g" };
}

function normalizeFood(food) {
  const dataType = food.dataType;
  const source = DATA_TYPE_SOURCE[dataType] || String(dataType || "unknown").toLowerCase();
  const isBranded = source === "branded";

  let nutrients;
  let nutrition_basis;

  if (isBranded && food.labelNutrients && Object.keys(food.labelNutrients).length) {
    nutrients = mapLabelNutrients(food.labelNutrients);
    nutrition_basis = "per_serving";
  } else {
    nutrients = mapFoodNutrients(food.foodNutrients || []);
    nutrition_basis = "per_100g";
  }

  const { serving_size, serving_unit } = isBranded
    ? {
        serving_size: food.servingSize != null ? Number(food.servingSize) : null,
        serving_unit: food.servingSizeUnit ?? null,
      }
    : pickServing(food);

  const gtin =
    food.gtinUpc || food.gtin || food.barcode || null;

  return {
    id: food.fdcId,
    source_id: food.fdcId,
    name: food.description || food.lowercaseDescription || null,
    description: food.description || null,
    source,
    barcode: gtin,
    gtin,
    brand: food.brandOwner || food.brandName || null,
    serving_size,
    serving_unit,
    nutrition_basis,
    nutrients,
  };
}

async function listFdcIds(apiKey, dataType, limit = Infinity) {
  const ids = [];
  let pageNumber = 1;
  for (;;) {
    if (ids.length >= limit) break;
    const url = new URL(`${API_BASE}/foods/list`);
    url.searchParams.set("api_key", apiKey);
    const body = {
      dataType: [dataType],
      pageSize: PAGE_SIZE,
      pageNumber,
      // CRITICAL: do not pass nutrients array (>25 IDs rejected). Omit entirely.
    };
    debugLog(`list ${dataType} page ${pageNumber}`);
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      `list ${dataType} p${pageNumber}`
    );
    const page = await res.json();
    const foods = Array.isArray(page) ? page : page.foods || [];
    if (!foods.length) break;
    for (const f of foods) {
      if (f.fdcId != null) ids.push(f.fdcId);
      if (ids.length >= limit) break;
    }
    log(`  listed ${dataType}: ${ids.length} ids (page ${pageNumber})`);
    if (foods.length < PAGE_SIZE) break;
    pageNumber++;
  }
  return ids.slice(0, Number.isFinite(limit) ? limit : undefined);
}

async function fetchFoodsByIds(apiKey, ids) {
  const url = new URL(`${API_BASE}/foods`);
  url.searchParams.set("api_key", apiKey);
  // No nutrient filter — full nutrients come back; we map client-side.
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fdcIds: ids }),
    },
    `foods batch(${ids.length})`
  );
  return res.json();
}

async function main() {
  const apiKey = process.env.FDC_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "FDC_API_KEY missing. Copy .env.example → .env and set a key from https://fdc.nal.usda.gov/api-key-signup.html"
    );
    console.error("Skipping foods.json generation (no fake USDA data invented).");
    process.exit(2);
  }

  const dataTypes = ["Foundation", "SR Legacy"];
  if (includeSurvey) dataTypes.push("Survey (FNDDS)");
  if (includeBranded) dataTypes.push("Branded");

  log(`Building food DB: ${dataTypes.join(", ")}`);
  if (Number.isFinite(maxFoods)) log(`  --max=${maxFoods}`);

  const allIds = [];
  for (const dt of dataTypes) {
    const remaining = Number.isFinite(maxFoods)
      ? maxFoods - allIds.length
      : Infinity;
    if (remaining <= 0) break;
    const ids = await listFdcIds(apiKey, dt, remaining);
    allIds.push(...ids);
  }

  log(`Total FDC ids to fetch: ${allIds.length}`);

  const foods = [];
  const stats = {
    fetched: 0,
    kept: 0,
    skipped_no_energy: 0,
    skipped_error: 0,
    by_source: {},
  };

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    try {
      const rawList = await fetchFoodsByIds(apiKey, batch);
      const list = Array.isArray(rawList) ? rawList : [];
      stats.fetched += list.length;
      for (const raw of list) {
        try {
          const norm = normalizeFood(raw);
          if (norm.nutrients.calories == null) {
            stats.skipped_no_energy++;
            debugLog(`skip no energy fdcId=${norm.id} ${norm.name}`);
            continue;
          }
          foods.push(norm);
          stats.kept++;
          stats.by_source[norm.source] = (stats.by_source[norm.source] || 0) + 1;
        } catch (e) {
          stats.skipped_error++;
          debugLog(`normalize error: ${e.message}`);
        }
      }
    } catch (e) {
      stats.skipped_error += batch.length;
      console.warn(`  batch failed [${batch.join(",")}]: ${e.message}`);
    }
    if ((i / BATCH_SIZE) % 10 === 0 || i + BATCH_SIZE >= allIds.length) {
      log(
        `  progress ${Math.min(i + BATCH_SIZE, allIds.length)}/${allIds.length} kept=${stats.kept} skipEnergy=${stats.skipped_no_energy}`
      );
    }
  }

  await mkdir(dirname(OUT_JSON), { recursive: true });
  const json = JSON.stringify(foods, null, 2) + "\n";
  await writeFile(OUT_JSON, json, "utf8");
  const bytes = Buffer.byteLength(json, "utf8");

  log("— Food DB summary —");
  log(`  kept:              ${stats.kept}`);
  log(`  fetched:           ${stats.fetched}`);
  log(`  skipped no energy: ${stats.skipped_no_energy}`);
  log(`  skipped errors:    ${stats.skipped_error}`);
  log(`  by source:         ${JSON.stringify(stats.by_source)}`);
  log(`  wrote:             ${OUT_JSON}`);
  log(`  file size:         ${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
