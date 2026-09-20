#!/usr/bin/env node
/**
 * Build assets/data/exercises.json from yuhonas/free-exercise-db (public domain).
 *
 * Usage:
 *   node scripts/build-exercise-db.mjs
 *   node scripts/build-exercise-db.mjs --images   # also download ~120MB into assets/exercises/
 *
 * Images default OFF. Paths in JSON always reference relative names from the source.
 */

import { mkdir, writeFile, access, constants } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_JSON = join(ROOT, "assets/data/exercises.json");
const OUT_IMAGES = join(ROOT, "assets/exercises");

const SOURCE_JSON =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

const KEYS = [
  "id",
  "name",
  "force",
  "level",
  "mechanic",
  "equipment",
  "primaryMuscles",
  "secondaryMuscles",
  "instructions",
  "category",
  "images",
];

const downloadImages = process.argv.includes("--images");

function normalize(raw) {
  return {
    id: raw.id ?? null,
    name: raw.name ?? null,
    force: raw.force ?? null,
    level: raw.level ?? null,
    mechanic: raw.mechanic ?? null,
    equipment: raw.equipment ?? null,
    primaryMuscles: Array.isArray(raw.primaryMuscles) ? raw.primaryMuscles : [],
    secondaryMuscles: Array.isArray(raw.secondaryMuscles)
      ? raw.secondaryMuscles
      : [],
    instructions: Array.isArray(raw.instructions) ? raw.instructions : [],
    category: raw.category ?? null,
    images: Array.isArray(raw.images) ? raw.images : [],
  };
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, dest) {
  await mkdir(dirname(dest), { recursive: true });
  if (await fileExists(dest)) return "skip";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return "ok";
}

async function main() {
  console.log(`Fetching ${SOURCE_JSON} …`);
  const res = await fetch(SOURCE_JSON);
  if (!res.ok) {
    throw new Error(`Failed to fetch exercises.json: HTTP ${res.status}`);
  }
  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error("Source exercises.json is not an array");
  }

  const exercises = raw.map(normalize);
  // Stable key order for readability / diffs
  const ordered = exercises.map((ex) => {
    const o = {};
    for (const k of KEYS) o[k] = ex[k];
    return o;
  });

  await mkdir(dirname(OUT_JSON), { recursive: true });
  const json = JSON.stringify(ordered, null, 2) + "\n";
  await writeFile(OUT_JSON, json, "utf8");

  const withImages = ordered.filter((e) => e.images?.length > 0).length;
  const bytes = Buffer.byteLength(json, "utf8");
  const kb = (bytes / 1024).toFixed(1);

  console.log("— Exercise DB summary —");
  console.log(`  count:            ${ordered.length}`);
  console.log(`  with image paths: ${withImages}`);
  console.log(`  wrote:            ${OUT_JSON}`);
  console.log(`  file size:        ${kb} KB (${bytes} bytes)`);

  if (!downloadImages) {
    console.log(
      "  images:           skipped (pass --images to download ~120MB into assets/exercises/)"
    );
    return;
  }

  console.log(`Downloading images into ${OUT_IMAGES} …`);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  const paths = [
    ...new Set(ordered.flatMap((e) => e.images || [])),
  ];
  for (let i = 0; i < paths.length; i++) {
    const rel = paths[i];
    const dest = join(OUT_IMAGES, rel);
    try {
      const result = await downloadFile(IMAGE_BASE + rel, dest);
      if (result === "skip") skip++;
      else ok++;
    } catch (err) {
      fail++;
      console.warn(`  fail ${rel}: ${err.message}`);
    }
    if ((i + 1) % 100 === 0 || i + 1 === paths.length) {
      console.log(`  progress ${i + 1}/${paths.length} (ok=${ok} skip=${skip} fail=${fail})`);
    }
  }
  console.log(`  images done: ok=${ok} skip=${skip} fail=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
