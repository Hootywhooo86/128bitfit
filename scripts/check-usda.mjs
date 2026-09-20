#!/usr/bin/env node
/**
 * Sanity-check USDA FoodData Central API access.
 * Reads FDC_API_KEY from .env / environment.
 *
 * Usage: node scripts/check-usda.mjs
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
loadDotenv({ path: join(ROOT, ".env") });

const API_BASE = "https://api.nal.usda.gov/fdc/v1";

async function main() {
  const apiKey = process.env.FDC_API_KEY?.trim();
  if (!apiKey) {
    console.error("FDC_API_KEY is not set.");
    console.error("  1. cp .env.example .env");
    console.error("  2. Get a free key: https://fdc.nal.usda.gov/api-key-signup.html");
    console.error("  3. Put FDC_API_KEY=... in .env");
    process.exit(2);
  }

  console.log("Checking USDA FDC API …");
  // Lightweight: fetch a single known Foundation food (Butter, salted fdcId 173410 is common; use list pageSize=1)
  const url = new URL(`${API_BASE}/foods/list`);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataType: ["Foundation"],
      pageSize: 1,
      pageNumber: 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`FAIL HTTP ${res.status}: ${body.slice(0, 300)}`);
    if (res.status === 403 || res.status === 401) {
      console.error("API key looks invalid or revoked.");
    }
    process.exit(1);
  }

  const data = await res.json();
  const foods = Array.isArray(data) ? data : data.foods || [];
  const sample = foods[0];
  console.log("OK — USDA FDC reachable with this key.");
  if (sample) {
    console.log(`  sample: fdcId=${sample.fdcId}  ${sample.description || sample.lowercaseDescription || ""}`);
  }
  console.log("Next: npm run build:foods");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
