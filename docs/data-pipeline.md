# Data pipeline and app file map

Reference for the offline databases and where things live. The product brief is
`CLAUDE.md`; this is the mechanical detail behind it.

## Generated assets (commit these)

| File | Source | Size | Contents |
|------|--------|------|----------|
| `assets/data/exercises.json` | [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain) | ~982 KB | 876 exercises |
| `assets/data/foods.json` | [USDA FoodData Central](https://fdc.nal.usda.gov/) API (public domain) | ~8.6 MB | 8,114 foods (Foundation + SR Legacy) |

Optional and gitignored: `assets/exercises/` image files (~120 MB). Paths in the
JSON still reference relative image names, so the app works without them.

Current counts and checksums live in `db/data-manifest.ts`.

## Regenerating

```bash
cp .env.example .env   # then set FDC_API_KEY
npm install

npm run build:exercises              # JSON only (default)
npm run build:exercises:images       # also download images into assets/exercises/

npm run check:usda                   # verify API key + ping FDC
npm run build:foods                  # Foundation + SR Legacy → foods.json
npm run build:foods -- --survey      # also FNDDS survey foods
npm run build:foods -- --branded --max=5000
npm run build:foods -- --debug

npm run verify:import                # headless: JSON → SQLite with expected counts
```

After regenerating either JSON, recompute `db/data-manifest.ts` (or bump
`version`) so devices re-import. That manifest is the single source for the
expected counts: `npm run verify:import` reads them from it and fails on a
mismatch, so there is no second place to update. It uses Node's built-in
`node:sqlite` (Node 22+) and needs no Expo runtime.

Both `npm run typecheck` and `npm run verify:import` run in CI on every push and
pull request — see `.github/workflows/ci.yml`.

## USDA pipeline rules (do not regress)

These are enforced in `scripts/build-food-db.mjs`. They exist because the API
rejected the obvious approach.

- **Never request more than 25 nutrient IDs in an API filter** — USDA rejects it.
  Fetch with no nutrient filter and map the ~31 nutrients client-side.
- **Branded foods: prefer `labelNutrients`** (per serving) over `foodNutrients`,
  and set `nutrition_basis` to match.
- **Energy nutrient IDs**: 1008, 2047, 2048 are kcal; 1062 is kJ and converts at
  `kcal = kJ / 4.184`. When several are present the priority is 1008 > 2048 >
  2047; kJ is only used when no kcal value was found.
- **Batches of 12**, with retry backoff 3/6/9/12/15s on 504s, timeouts and 429s.
- **Skip foods with no usable energy** and report the skip counts at the end.

## Record shapes

### Exercise

`id`, `name`, `force`, `level`, `mechanic`, `equipment`, `primaryMuscles`,
`secondaryMuscles`, `instructions`, `category`, `images`

### Food

- `id` / `source_id` (fdcId), `name` / `description`, `source`
  (`foundation` | `sr_legacy` | `survey` | `branded`)
- `barcode` / `gtin` when present
- `serving_size`, `serving_unit`, `nutrition_basis` (`per_100g` | `per_serving`)
- `nutrients` map — 31 keys, nulls allowed: calories, protein, fat, carb, fiber,
  sugars, saturated_fat, trans_fat, cholesterol, sodium, potassium, calcium,
  iron, magnesium, phosphorus, zinc, copper, manganese, selenium, vitamin_c,
  thiamin, riboflavin, niacin, pantothenic_acid, vitamin_b6, folate,
  vitamin_b12, vitamin_a, vitamin_d, vitamin_e, vitamin_k

Consumers must respect `nutrition_basis` — a branded per-serving record and a
Foundation per-100g record are not interchangeable. `lib/nutrition.ts` handles
this; go through it rather than doing the arithmetic inline.

---

## App file map

The Expo app lives at the **repo root** (Expo Router `app/` directory). Data
pipelines stay in `scripts/` + `assets/data/`. Run with `npx expo start` (or
`npm start`).

- SQLite schema: `db/schema.ts`. Migrations in `drizzle/`, generated with
  `npm run db:generate`.
- Import: `db/import.ts`, checksum-gated via `db/data-manifest.ts`. Do not parse
  the JSON into the UI on every launch.

### Train / workouts

- Schema: `routines`, `routine_exercises`, `workout_sessions`,
  `session_exercises`, `sets`
- Queries: `db/workout-queries.ts`; starter seed: `db/seed-routines.ts` (once, if empty)
- Rest timer: `lib/rest-timer.tsx` + `lib/rest-timer-notifications.ts`
- Screens: `app/(tabs)/train.tsx`, `app/train/active.tsx`,
  `app/train/add-exercise.tsx`, `app/train/summary.tsx`

### Rest timer notifications

- Package: `expo-notifications` (config plugin in `app.json`; Android channel `rest_timer`)
- On first timed rest: explain, then request notification permission
- Rest start schedules a local notification for rest end; +15 / Skip / complete
  cancel or reschedule it
- Notification category actions `+15s` and `Skip` appear on the delivered alert
- Tapping the alert opens the active workout when `sessionId` is known
- **Do not rely on `setTimeout` alone when backgrounded** — the OS schedule is
  the completion signal
- iOS Silent / Focus may mute the notification sound

### Fuel / nutrition logging

- Schema: `food_logs`, `water_logs`, `settings` (calorie/protein/water targets)
- Queries: `db/food-queries.ts`; macros helper: `lib/nutrition.ts`
- Screens: `app/(tabs)/fuel.tsx`, `app/fuel/add.tsx`, `app/fuel/edit/[id].tsx`
- Barcode: `app/fuel/scan.tsx` + `app/fuel/custom.tsx`; lookup `db/barcode-queries.ts`
- Open Food Facts: `lib/open-food-facts.ts` (per-barcode v2 API); cache table
  `off_food_cache`. ODbL share-alike — per-barcode lookups only, no bulk ingest.
- Lookup order: local USDA barcode/gtin → OFF cache → OFF API → custom food form

### Home + Coach (BYO key)

- Schema: `weight_entries`, `coach_threads`, `coach_messages`; settings keys for
  goals and AI prefs (`ai_provider`, `ai_model`, `ai_base_url`)
- Queries: `db/weight-queries.ts`, `db/settings-queries.ts`, `db/coach-context.ts`,
  `db/ai-settings.ts`, `db/coach-chat.ts`
- AI client: `lib/ai-coach.ts` (Anthropic / OpenAI / Gemini / OpenRouter / custom
  OpenAI-compatible); keys in `lib/ai-secure.ts` via expo-secure-store
- Coach builds a SQLite context pack and calls the selected provider. Real
  responses only — if there is no key, show the stub UX, never invented output.

### Zero vs no data

- The rule from CLAUDE.md's empty-state table: `0` claims a measurement was
  taken and came back zero; absence gets a dash or a prompt. Never conflate them.
- Where it is enforced: `lib/health/types.ts` (`steps: number | null`),
  `lib/calorie-ring.ts` (`consumed: number | null`). Both keep the decision in a
  typed state so it is testable, rather than inside JSX.
- Callers must opt in — `number` satisfies `number | null`, so typecheck will not
  catch a screen still passing a filled zero. `app/(tabs)/fuel.tsx` and
  `app/(tabs)/index.tsx` pass `logs.length > 0 ? totals.calories : null`.
- A *logged* zero (a 0 kcal drink) is a real reading and keeps the normal
  display. Only absence gets the empty treatment.
- `app/(tabs)/coach.tsx` counts completed sessions and says it has nothing to go
  on rather than inventing encouragement.

### Network deadlines

- `lib/net.ts` — use `fetchWithTimeout`, never bare `fetch`. Every call site has
  a deadline: `LOOKUP_TIMEOUT_MS` (8s) for a lookup someone is waiting on
  mid-workout, `AI_TIMEOUT_MS` (60s) for a model reply.
- **Error handling is not enough on its own.** A hung request never rejects, so
  the offline paths downstream never run — non-negotiable #4 says the UI never
  waits on the network, and only a deadline delivers that.
- A `signal` passed inside `init` is composed with the deadline, not replaced.
  Overwriting it silently breaks cancel buttons; `lib/ai-coach.ts` passes its
  signal that way.
- A deadline breach throws `NetworkTimeoutError`; an outer cancel keeps its own
  rejection, so a deliberate cancel is never reported as a timeout.
- Open Food Facts lookups surface `reason: 'timeout'` separately from
  `'network'`, and `db/barcode-queries.ts` turns it into a message that points
  at the custom food form.

### Set pre-fill

- `lib/set-prefill.ts` (pure) decides what a new set starts with;
  `getLastPerformance()` in `db/workout-queries.ts` does the lookup
- Seeds all three creation paths: `startRoutineWorkout`, `addExerciseToSession`
  and `addSet`. Adding a fourth means seeding it too, or logging silently gets
  slower again.
- Precedence is: the previous set in this session > the routine's target reps >
  last session. Weight always comes from last session, because a routine never
  carries one.
- **Only completed sets of completed sessions count.** An abandoned workout is
  full of pre-filled values nobody lifted; seeding from those would compound a
  guess into a record.
- The lookup is scoped to one `session_exercises` row, not to
  `session_id + exercise_id`. An exercise can appear twice in a workout, and
  matching on the pair merges both blocks into one interleaved list.
- `app/train/active.tsx` shows `Last: 135×8, ...` above the sets so a pre-filled
  number reads as last week's rather than as something already logged.

### Building an Android APK

```bash
npx eas build -p android --profile preview   # cloud, needs an Expo login
```

Or locally, with the Android SDK installed and `ANDROID_HOME` set:

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

`android/` is generated and gitignored — configure the build through `app.json`,
never by editing that directory, or `prebuild` will discard the change.

Two things the build depends on:

- **`minSdkVersion` is 26**, set via the `expo-build-properties` plugin.
  Health Connect's `androidx.health.connect:connect-client` declares
  `minSdk 26`; Expo defaults to 24, and the manifest merge fails outright
  without this. Nothing in typecheck or the test suite catches it — only a real
  build does.
- **`android.package`** is `com.hootywhooo86.bit128fit`. Package segments cannot
  begin with a digit, so `128bitfit` cannot be one. This is permanent once
  published to Play.

The release build is signed with the debug keystore (the React Native template
default), which is fine for sideloading but must be replaced with a real upload
key before any Play submission.

### Running the app

The real target is **Android with a dev build** — Expo Go cannot load the native
modules this app uses (SQLite, notifications, camera, secure store, Health
Connect). `eas.json` has the profiles:

```bash
npx eas build -p android --profile development   # dev client, hot reload
npx eas build -p android --profile preview       # standalone APK to sideload
```

A web build also runs, which is the quickest way to click through the UI:

```bash
npm run build:web    # expo export -p web
npm run serve:web    # → http://localhost:8090
```

Two things about web, both load-bearing:

- `metro.config.js` adds `wasm` to `assetExts`. expo-sqlite's web worker imports
  `wa-sqlite.wasm`, and without it the bundle cannot resolve the file and the
  app 500s before rendering.
- `scripts/serve-web.mjs` sets COOP + COEP. SQLite on web runs in a worker using
  SharedArrayBuffer, which browsers only expose on a cross-origin-isolated page,
  so a plain static server is not enough.
- `npx expo start --web` (dev server) still fails with "Worker chunk not found"
  — an Expo dev-serializer issue, unrelated to the config above. Use the export.
- Web needs OPFS `createSyncAccessHandle`. Desktop Chrome has it; some headless
  browsers do not, and there the worker hangs with "Sync operation timeout".

### Tests

- `npm test` (vitest, `npm run test:watch` while working). Runs in CI across
  UTC, America/Los_Angeles, Pacific/Kiritimati (UTC+14) and Asia/Kathmandu
  (+05:45) — **the matrix is load-bearing**: replacing `dayKey` with
  `toISOString()` passes a UTC-only run and fails in Los Angeles.
- Unit tests cover the pure modules only: `lib/calorie-floor.ts`,
  `lib/export/csv.ts`, `lib/export/json.ts`, `lib/health/dates.ts`. Those are
  deliberately free of React Native, database and filesystem imports so they can
  be tested without a device — keep it that way when extending them.
- Anything touching SQLite, Health Connect or the filesystem is not covered here
  and still needs a real build.

### Calorie floor

- `lib/calorie-floor.ts` (pure) + `lib/avatar.ts` for the Mifflin–St Jeor BMR
- Floor is the highest of: an absolute minimum (1200 kcal, 1500 for male
  profiles), the user's BMR, and 75% of TDEE (the 25% deficit cap)
- When TDEE is known the deficit cap always dominates BMR — TDEE is BMR × 1.375,
  so 75% of it is ~1.03 × BMR. Both bounds stay explicit so the rule survives a
  change to the activity multiplier.
- **Enforced in `db/settings-queries.ts` `updateAppSettings()`**, the single path
  into the `calorie_target` setting. Do not clamp in a screen instead — the other
  screens would be a way around it.
- Screens call `previewCalorieTarget()` only to explain the change; enforcement
  does not depend on them doing so
- Onboarding logs the weigh-in *before* saving goals, so the floor computes
  against a profile that has a weight in it
- `ensureDefaultGoals()` in `db/food-queries.ts` seeds 2200 unclamped; that runs
  before any profile exists, where the floor is at most 1500, so it cannot land
  below it. Known gap: a stored target is not re-clamped if the body profile
  changes later — it is corrected on the next save.

### Data export

- `lib/export/` — `csv.ts` and `json.ts` are pure (no db, no filesystem) and carry
  the logic worth testing; `collect.ts` reads SQLite; `index.ts` writes the files
- Screen: `app/settings/export.tsx`, linked from Settings
- Output: a timestamped folder under the document directory holding
  `128bitfit-export.json` (complete, re-importable) and one CSV per table
- **Exported:** routines, routine_exercises, workout_sessions, session_exercises,
  sets, food_logs, water_logs, weight_entries, settings, coach_threads,
  coach_messages
- **Not exported, and the JSON says so in an `excluded` block:** `exercises` and
  `foods` (bundled public-domain reference data, ~9 MB, not the user's),
  `off_food_cache` (a reconstructible ODbL cache — exporting it would
  redistribute third-party data), `meta` (internal bookkeeping)
- API keys are never exported. They live in expo-secure-store; nothing in
  `lib/export/` reads them. Keep it that way.
- Rows pointing at bundled tables carry the resolved name (`exercise_name`,
  `food_name`) so each file stands alone without the reference data
- CSV text cells starting with `= + - @`, tab or CR are prefixed with `'`, because
  a spreadsheet would otherwise execute them. Numbers skip that guard, so a
  negative value stays `-5` rather than becoming text. JSON is the lossless copy.

### Muscle load (the muscle map)

- `lib/muscle-load.ts` (pure) — the 17 muscle groups the bundled exercise data
  actually uses, the tally, and the load buckets. `db/muscle-queries.ts` does the
  aggregation in one grouped query.
- Screens: `app/progress.tsx` (7/30/90-day windows, ranked list) and
  `components/MuscleLoadCard.tsx` on Home. The map is the app's signature view,
  so it sits up front rather than behind a tab.
- **The scale comes straight from CLAUDE.md**: yellow 1–3 sets, orange 4–7, red
  8+. Untrained is greyscale, because grey is the absence of load rather than a
  low amount of it. `muscleHeat` in `lib/theme.ts` is the only colour in the app
  — a user-selectable accent must never be added to this scale.
- A set counts fully for the muscle an exercise targets and **half** for the ones
  it assists (`SECONDARY_SET_WEIGHT`). Counting assists equally would make every
  pressing day look like a triceps day.
- Only completed sets of completed sessions count, the same rule set pre-fill
  uses — colouring a muscle from an abandoned workout would invent training that
  never happened.
- Unknown muscle names are ignored rather than guessed at, so a typo in the data
  shows up as a missing muscle instead of load on the wrong one.
- `lib/muscle-figure.ts` holds the geometry as **overlapping ovals**, not boxes.
  Each muscle belly is an ellipse (or a taper, for the traps and the ab gutters)
  rasterised onto a 48x76 grid. Shapes paint in order, so a later one sits on top
  of an earlier one — that is how the pecs overlap the ribcage.
- The figure is drawn in two passes. A **structure pass** in `null` paint (grey,
  never coloured) lays down a solid body: skull, jaw, neck, ribcage, waist, hips,
  arms, fists, legs, feet. The **belly pass** then draws each muscle inset by
  about one cell. Two things fall out of that: the silhouette has no holes where
  two muscles fail to meet, and the cell of structure left showing between
  neighbours is the separation line that makes the groups read as distinct
  instead of as one blob. The six-pack is the same trick in reverse — a grid of
  one-cell `null` tapers carved back out of the ab ellipse.
- Joints get a deliberate one-cell gap (elbow, knee), so limbs read as two
  segments rather than one slab.
- `rasterise()` then covers the painted grid with **greedy maximal rectangles**:
  grow right, then grow down while the whole row still matches. Every rect is a
  View and both figures are on screen at once, so the count is what matters —
  ~236 front / ~219 back, against ~1,800 for a View per cell. Merging row runs
  instead costs about a third more, because a curve rarely repeats the same start
  and width twice running.
- The geometry is original. It traces no existing artwork.
- **Coverage is closed, not best-effort.** `lib/muscle-figure.test.ts` asserts
  that every muscle in the shipped exercise data is a known group, that every
  group is drawn somewhere on the figure, and that the figure draws nothing that
  is not a known group. A muscle with nowhere to go is a failing test, not a
  silent drop at runtime.
- The same file asserts that `rasterise()` **tiles exactly**: every painted cell
  is covered once, with no overlap and no gap. An overlap is a wasted View and a
  wrong colour where the rects cross; a gap is a hole in the figure. Neither is
  visible in a diff, which is why it is a test.
- Glutes are drawn on the back only; on the front that region is hip structure.
  Colouring it there merged the hips and quads into one mass.

### Privacy & Health Connect compliance

- Policy: `docs/privacy-policy.md`. In-app screen: `app/settings/privacy.tsx`,
  linked from Settings and from the Steps card's connect prompt.
- Keep the policy true to the code. It states there is no backend, no analytics
  and no telemetry, and that the only outbound calls are Open Food Facts
  (barcode only), the AI provider the user configured, and GitHub for exercise
  images. Adding a network call means updating that document.
- `components/StepsCard.tsx` explains before requesting, the same pattern the
  rest timer uses for notifications. A permission sheet with no preamble gets
  declined.

**Still outstanding for Google Play.** Health Connect access on Play needs a
data-access declaration, which requires a *publicly hosted* privacy policy URL
and a working in-app rationale screen:

1. Host `docs/privacy-policy.md` at a public URL and point `POLICY_URL` in
   `app/settings/privacy.tsx` at it. It currently links to the file on GitHub,
   which works but is not a proper policy page.
2. The `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent filter is
   declared by the library's config plugin and points at MainActivity, but
   **nothing handles the intent** — tapping "privacy policy" inside the Health
   Connect dialog opens the app on Home. Routing it to `/settings/privacy` needs
   native work: the intent carries an action and no URI, so Expo Router cannot
   see it. A small config plugin or native module is required.
3. Check Google's current Health Connect policy for the declaration form and
   review process before submitting.

### Health (Health Connect)

- Entry point: `lib/health/` — import `health` from `lib/health`, never a platform SDK
- `types.ts` is the `HealthProvider` interface (`readDays()` / `writeEntries()`);
  `health-connect.ts` is the Android implementation, `unavailable.ts` the fallback
  for iOS and web until HealthKit lands
- `index.ts` requires the Android module **lazily**. `react-native-health-connect`
  resolves its native module with `TurboModuleRegistry.getEnforcing` at import
  time, which throws on iOS, web and Expo Go — a static import crashes the app at
  launch. Keep the lazy require and its try/catch.
- `app.json` needs both the `react-native-health-connect` plugin **and** the
  `android.permission.health.*` entries. The config plugin only adds the
  permission-rationale intent filters; it does not declare permissions, so reads
  fail silently at runtime without them. Adding a record type means adding its
  permission here too.
- A day's metric is `number | null`: `null` means no reading was taken, `0` means
  it was read and was zero. `components/StepsCard.tsx` renders those differently
  and must keep doing so — see the empty-state table in `CLAUDE.md`.
- Local calendar days come from `lib/health/dates.ts`. Use it rather than
  `toISOString()`, which is UTC and shifts the day boundary west of Greenwich.

### Pixel avatar + onboarding

- Settings keys: `onboarding_complete`, `avatar_config` (JSON),
  `show_avatar_on_home`, `sex`, `birthday`, `height_cm`
- `lib/avatar.ts` (palettes + Mifflin–St Jeor helpers),
  `components/PixelAvatar.tsx`, `components/AvatarCreator.tsx`
- Gate: `components/OnboardingGate.tsx` → `app/onboarding/index.tsx`
  (Basics → Avatar → Goals → Done)
- Renderer poses: `idle` / `curl` / `eat` / `think`; Home uses idle
