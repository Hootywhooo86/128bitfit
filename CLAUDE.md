# 128bitfit — offline data / DB bible

Private fitness + nutrition app. This doc covers **offline databases only** (Expo app comes later).

## Generated assets (commit these)

| File | Source | Approx size |
|------|--------|-------------|
| `assets/data/exercises.json` | [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain) | ~677 KB, ~876 exercises |
| `assets/data/foods.json` | [USDA FoodData Central](https://fdc.nal.usda.gov/) API | ~4 MB (Foundation + SR Legacy) |

Optional (gitignored): `assets/exercises/` image files (~120 MB). Paths in JSON still reference relative image names.

## Regenerating

```bash
cp .env.example .env   # then set FDC_API_KEY
npm install

npm run build:exercises              # JSON only (default)
npm run build:exercises:images       # also download images into assets/exercises/

npm run check:usda                   # verify API key + ping FDC
npm run build:foods                  # Foundation + SR Legacy → foods.json
npm run build:foods -- --survey      # include FNDDS survey foods
npm run build:foods -- --branded --max=5000
npm run build:foods -- --debug
```

## Exercise record shape

`id`, `name`, `force`, `level`, `mechanic`, `equipment`, `primaryMuscles`, `secondaryMuscles`, `instructions`, `category`, `images`

## Food record shape

- `id` / `source_id` (fdcId), `name` / `description`, `source` (`foundation` | `sr_legacy` | `survey` | `branded`)
- `barcode` / `gtin` when present
- `serving_size`, `serving_unit`, `nutrition_basis` (`per_100g` | `per_serving`)
- `nutrients` map (31 keys; nulls allowed): calories, protein, fat, carb, fiber, sugars, saturated_fat, trans_fat, cholesterol, sodium, potassium, calcium, iron, magnesium, phosphorus, zinc, copper, manganese, selenium, vitamin_c, thiamin, riboflavin, niacin, pantothenic_acid, vitamin_b6, folate, vitamin_b12, vitamin_a, vitamin_d, vitamin_e, vitamin_k

## USDA pipeline rules (do not regress)

- Never request >25 nutrient IDs in an API filter (USDA rejects). Prefer no nutrient filter; map client-side.
- Branded foods: prefer `labelNutrients` (per serving); set `nutrition_basis` accordingly.
- Energy nutrient IDs: 1008, 2047, 2048 (kcal); 1062 (kJ → kcal / 4.184).
- Small batches (~12) with retry backoff 3/6/9/12/15s on 504 / timeouts.
- Skip foods with no usable energy; report skip counts.
