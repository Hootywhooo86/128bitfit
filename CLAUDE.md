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

---

## Expo app (foundation)

- App lives at **repo root** (Expo Router `app/` directory). Data pipelines stay in `scripts/` + `assets/data/`.
- Run: `npx expo start` (or `npm start`).
- SQLite schema: `db/schema.ts`. Migrations: `drizzle/` (generate with `npm run db:generate`).
- Import: `db/import.ts` — checksum-gated via `db/data-manifest.ts`. Do not parse JSON into UI every launch.
- After regenerating `exercises.json` / `foods.json`, recompute `db/data-manifest.ts` (or bump `version`) so devices re-import.

### Train / workouts

- Schema: `routines`, `routine_exercises`, `workout_sessions`, `session_exercises`, `sets`
- Queries: `db/workout-queries.ts`; starter seed: `db/seed-routines.ts` (once if empty)
- Rest timer: `lib/rest-timer.tsx` + `lib/rest-timer-notifications.ts` (in-app countdown synced to OS local notifications via `expo-notifications`; +15/Skip actions; lock-screen alert)
- Screens: `app/(tabs)/train.tsx`, `app/train/active.tsx`, `app/train/add-exercise.tsx`, `app/train/summary.tsx`


### Rest timer notifications

- Package: `expo-notifications` (config plugin in `app.json`; Android channel `rest_timer`)
- On first timed rest: explain + request notification permission
- Rest start schedules a local notification for rest end; +15 / Skip / complete cancel or reschedule it
- Notification category actions: `+15s` and `Skip` (appear on the delivered rest-end alert)
- Tapping the alert opens Train / active workout when `sessionId` is known
- Do not rely on `setTimeout` alone when backgrounded; OS schedule is the completion signal
- Out of scope: Wear OS, custom arcade sound library, Health Connect
- iOS Silent / Focus may mute notification sound

### Fuel / nutrition logging

- Schema: `food_logs`, `water_logs`, `settings` (calorie/protein/water targets)
- Queries: `db/food-queries.ts`; macros helper: `lib/nutrition.ts` (respects `nutrition_basis`)
- Screens: `app/(tabs)/fuel.tsx`, `app/fuel/add.tsx`, `app/fuel/edit/[id].tsx`
- Barcode: `app/fuel/scan.tsx` + `app/fuel/custom.tsx`; lookup `db/barcode-queries.ts`
- Open Food Facts: `lib/open-food-facts.ts` (per-barcode v2 API + ODbL note); cache table `off_food_cache`
- Lookup order: local USDA barcode/gtin → OFF cache → OFF API → custom food form
- Out of scope: bulk OFF import, AI meal photo, recipes

### Home + Coach (BYO key)

- Schema: `weight_entries`; `coach_threads` / `coach_messages`; settings keys for goals + AI prefs (`ai_provider`, `ai_model`, `ai_base_url`)
- Queries: `db/weight-queries.ts`, `db/settings-queries.ts`, `db/coach-context.ts`, `db/ai-settings.ts`, `db/coach-chat.ts`
- AI client: `lib/ai-coach.ts` (Anthropic / OpenAI / Gemini / OpenRouter / custom OpenAI-compatible); keys in `lib/ai-secure.ts` via expo-secure-store
- Home: calorie ring + water, last workout / Train CTA, weight latest + log screen, optional training week strip
- Coach: post-workout / ask / weekly check-in — builds SQLite context pack, calls selected provider (real responses only; stub UX if no key)
- Settings: goals + AI provider picker, model, optional base URL, BYO API key; barcode data licenses note; Character editor
- Out of scope: on-device LLM weights, Health Connect, paid themes, subscriptions

### Pixel avatar + onboarding

- Settings keys: `onboarding_complete`, `avatar_config` (JSON), `show_avatar_on_home`, `sex`, `birthday`, `height_cm`
- `lib/avatar.ts` (palettes + Mifflin–St Jeor helpers), `components/PixelAvatar.tsx` (layered Views), `components/AvatarCreator.tsx`
- Gate: `components/OnboardingGate.tsx` → `app/onboarding/index.tsx` (Basics → Avatar → Goals → Done)
- Home: small idle avatar (Settings show/hide); re-edit via Settings → Character
- Poses supported on renderer (`idle` / `curl` / `eat` / `think`); Home uses idle
- Out of scope: hand-drawn 28×44 asset pipeline, clothing shop, Health Connect

