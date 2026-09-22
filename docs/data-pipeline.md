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
- Queries: `db/workout-queries.ts`; starter seed: `db/seed-routines.ts` — once
  ever, flagged by the `starter_routines_seeded` setting, never re-seeded when
  the table is empty (deleting every routine used to bring the starters back).
- Deleting: sessions in `app/train/history.tsx`, routines in
  `app/train/routines.tsx`. Both use a visible Delete on the row, never a
  long-press — the normal tap on a routine starts a workout.
- Rest timer: `lib/rest-timer.tsx` + `lib/rest-timer-notifications.ts`
- Screen wake lock: `lib/session-awake.ts` (the rule) + `lib/use-session-awake.ts`
  (the effect). Held only while a session is `in_progress`, released on unmount.
  `expo-keep-awake` needs no permission and no config plugin — it sets
  `FLAG_KEEP_SCREEN_ON`. Setting `keep_awake`, on by default.
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

### Exercise search

- `listExercises` matches name, both muscle columns, equipment and category —
  "chest" finds the bench press, "hamstrings" finds 277 exercises where a name
  match alone found none. Name matches rank first so "row" still leads with rows.
- Custom exercises: `app/exercise/new.tsx`, reachable from the library **and**
  from `app/train/add-exercise.tsx` with a `sessionId`, which adds the finished
  exercise straight into the running session.

### Personal records

- Rule: `lib/personal-records.ts`. Two kinds kept apart — **heaviest** (a
  measurement) and **best estimated 1RM** (Epley, capped at 12 reps, always
  labelled as a formula rather than a lift). Ties do not count; the first ever
  set of an exercise is not a record; units are never compared across.
- Queries: `recordBefore()`, `personalRecordsIn(sessionId)` (judged against
  everything before that session started, one per exercise), and
  `listPersonalRecords()` for the screen.
- Shown as 🏆 on the workout summary and at `app/train/records.tsx`.
- Warm-ups and discarded sessions are excluded — a warm-up is not an attempt.

### Imported exercises with no muscles

- openGym references its built-in exercises by number and its backup carries
  neither names nor muscles, so they import as `openGym 0577` with `[]` muscles
  and colour nothing on the map. On a real backup: 101 exercises, 3,956 sets,
  93% of the history.
- `listUntaggedExercises()` finds them (sets logged, no muscles), ordered by set
  count. `mergeExerciseInto(from, to)` re-points `session_exercises` and
  `routine_exercises` then deletes the placeholder, so the history keeps its
  weights and dates and the map fills in retroactively.
- Screen: `app/train/match-imported.tsx`, linked from the muscle card on Home
  whenever untagged exercises exist — a grey map with a full history has to say
  why.

### Fuel / nutrition logging

- Schema: `food_logs`, `water_logs`, `settings` (calorie/protein/water targets)
- Queries: `db/food-queries.ts`; macros helper: `lib/nutrition.ts`
- Screens: `app/(tabs)/fuel.tsx`, `app/fuel/add.tsx`, `app/fuel/edit/[id].tsx`
- Barcode: `app/fuel/scan.tsx` + `app/fuel/custom.tsx`; lookup `db/barcode-queries.ts`
- Sleep is attributed to the day you **wake up**, not the day the session
  started (`lib/health/sleep.ts`), and `readDays` reads sleep from one day
  earlier than the rest of the range so a night that began the previous evening
  is caught. Sleep is also never zero-filled on an empty result, unlike the
  counters — no session means nobody recorded one.
- AI vision: `visionSupport(provider, modelVision)` in `lib/ai-coach.ts`.
  Anthropic/OpenAI/Gemini always; Hugging Face depends on the model, which the
  router reports as `architecture.input_modalities` and `parseHfModels` reads
  into `HfModel.vision`. The flag is saved as `ai_model_vision` when a model is
  picked, so the check is offline; a hand-typed model is 'unknown' and the call
  is attempted rather than refused.
- Label scan: `app/fuel/label.tsx`, two shots — front of pack then nutrition panel.
  The pack shot becomes the food's photo and gives a name guess
  (`lib/package-label.ts`); the panel shot is OCR'd for numbers
  (`lib/nutrition-label.ts`) and discarded. Step 1 is skippable, and skipping it
  falls back to the panel shot as the photo. The name is a guess: it pre-fills
  an editable field and the form says where it came from.
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

### The shell and the design system

`prototype/app-shell.html` is the visual spec — CLAUDE.md says so — and the
first port of these screens did not follow it. It used stock navigation headers
showing the route name, react-navigation's default tab bar, and per-screen
one-off styles. The result was a generic dark app rather than this one.

The fix was to stop styling screens individually:

- **`lib/theme.ts`** holds the prototype's `:root` variables verbatim. If a
  value here and a value there disagree, the prototype is right.
- **`components/ui.tsx`** is one component per prototype CSS class, and each
  names its counterpart: `Screen` (`main`), `Label` (`.lbl`), `Card` (`.card`),
  `CardHead` (`.ch`), `MenuRow` (`.mrow`), `Stat3` (`.st3`),
  `SessionCard` (`.sess`), `MacroBar` (`.mac`), `Bar` (`.jbar`),
  `QuickActions` (`.qa`), `Note` (`.note`). Screens are assembled from these.
- **`components/TopBar.tsx`** (`.bar`) always reads `128BIT FIT` with the
  section beneath it in pixel type — never the route's name. The stock header
  is off by default in `app/_layout.tsx`; a screen not yet ported re-enables a
  styled one rather than being left with no way back.
- **Fonts.** Silkscreen for section labels, headers and tab labels; Inter for
  body text. The first frame is held until both load, so labels do not reflow
  from the system font.

Two typefaces, two jobs: pixel type never runs as body text, and body type
never appears in a section label.

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

**Size: cut the emulator architectures.** A default `assembleRelease` is a
universal APK carrying native libraries for all four ABIs, and those libraries
are most of the download:

| | compressed |
| --- | --- |
| `lib/x86` | 29.5 MB |
| `lib/x86_64` | 28.8 MB |
| `lib/arm64-v8a` | 27.4 MB |
| `lib/armeabi-v7a` | 18.6 MB |
| JS bundle | 6.1 MB |
| dex | ~20 MB |
| **universal APK** | **135 MB** |

`x86` and `x86_64` exist for emulators; no phone uses them. Dropping them takes
the APK to about 77 MB while still installing on both 32- and 64-bit devices:

```bash
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

Pass the ABI list on the command line rather than editing
`android/gradle.properties`, which `prebuild` regenerates.

R8 (`enableProguardInReleaseBuilds`) would take another ~12 MB off the dex, and
is deliberately **not** enabled: shrinking can strip classes that Expo modules
reach by reflection, and the failure mode is a crash on launch that no test in
this repo would catch. Turn it on when there is a device to test the result on.

### Getting the APK onto a phone

`.github/workflows/apk.yml` builds it and attaches it to a GitHub Release.
Run it from the Actions tab with a tag (`v0.1.0-alpha.1`); the release page
gives a plain download link that works in a phone browser with no login and no
zip to unpack. The workflow runs `verify:import` first, so a build that lost its
bundled exercise or food database fails instead of shipping hollow.

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
  actually uses, the tally, the load buckets, and `muscleRoles()`.
- `db/muscle-queries.ts` runs one grouped query for completed sets of completed
  sessions and feeds both. Only completed sets of **completed** sessions count:
  an abandoned workout is full of values nobody lifted, and colouring a muscle
  from those would invent training that did not happen.
- **Red is targeted, yellow is assisted.** `muscleRoles()` classifies each
  muscle for the window: `primary` if any exercise named it as a target,
  `secondary` if it only ever assisted, `none` otherwise. A muscle that was both
  is primary — the harder classification wins, because that is what the training
  actually was, and the order the exercises were logged in must not change the
  answer. Both directions are tested.
- `muscleRole` in `lib/theme.ts` holds the two colours. They are the same two
  ends as the `muscleHeat` load scale, so the two never read as different
  meanings of the same colour. Untrained stays untinted — absence of load, not a
  low amount of it.
- Unknown muscle names are ignored rather than guessed at, so a typo in the data
  shows up as a missing muscle instead of load on the wrong one.

#### The artwork

`assets/figure/` holds, per view, a body silhouette, the line art, and one alpha
mask per muscle — 13 each. `components/MuscleMap.tsx` stacks three layers: the
body in near-black, fills for whatever the session worked, then the line art on
top. The lines have to be last or a filled muscle would erase its own
definition.

The figure is a **silhouette**: no skin tone, no shading, just the muscle
outlines on near-black. The only colour on it is the training — red where a
muscle was the exercise's target, yellow where it assisted. An untrained figure
is entirely uncoloured, which is the honest first-run state.

- `lib/figure-assets.ts` `require()`s every asset **statically**. Metro resolves
  asset paths at build time, so a computed `require` bundles nothing and the map
  would render no colour at all.
- `assets/figure/figure.json` records which muscles each view carries, and
  `lib/figure-assets.test.ts` asserts against it: every muscle in the shipped
  exercise data is a known group, every known group has artwork on at least one
  view, the artwork names nothing that is not a known group, and each muscle is
  on the view it is visible from — glutes on the back, pecs on the front.
  Drawing a muscle on the wrong view colours the wrong part of the body, which
  is worse than not colouring it.
- **A region is the whole muscle.** The grown region used to be clipped back to
  its seed polygon, which left a quad half filled: the polygon is a rough guess
  at where the muscle is, the basin is where the artwork says it ends. The clip
  is gone, and coverage went from about half the body to 83% front / 77% back —
  the rest being the head, hands and feet, which are not muscle groups.
- **Background is what lies well away from a muscle**, by distance transform,
  not "anything unclaimed". Treating every unclaimed cell as background left
  the outer thigh and the forearm grey, because the seed polygons are narrower
  than the muscles they name.
- **Regions come from the artwork, not from a polygon.** Hand-drawn polygons
  never line up: they spill over a drawn edge or stop short of one, and the
  first version visibly did both. The masks are now built by watershed — seeded
  inside each muscle, with the artwork's own gradient as the elevation, so a
  region grows until it reaches a line the artist drew and stops there.
- A watershed alone is not enough either: the detected edges have gaps, so a
  single seed floods a whole limb. Each grown region is therefore kept only
  where it stays inside its anatomical polygon, slightly dilated. The polygon
  says roughly where, the watershed says exactly to which edge. Anything no
  polygon claims is seeded as background, so nothing floods into the head,
  hands, feet or trunks.
- Seed polygons are authored in fractions of the figure's bounding box against
  measured landmarks (chin 0.13, nipple 0.27, navel 0.40, crotch 0.55, knee
  0.70, ankle 0.90). Only the left half is authored; the generator mirrors it.
- The glutes are the one region still shaped by its polygon rather than the
  art: the trunks are a flat area with no lines under them, so there is no
  contour for the watershed to find.
- **Provenance:** the base artwork was supplied by the project owner, not
  generated here. It is third-party work and its licence has not been
  established — that needs settling before any Play submission.

### Logging a meal with AI

Fuel's first action is **AI**, with two ways in:

- **Describe** — type what you ate ("3 eggs, 2 toast, 50 g cottage cheese") and
  the model returns items with macros.
- **Photo** — photograph the plate and the model estimates from that.

Both use the user's own key via `lib/ai-food-client.ts`; the request goes
straight to their provider, as every other AI call does.

**Everything it produces is an estimate, and the app says so.** A model guessing
a portion size from a photo, or from "some cottage cheese", is not measuring
anything. Per CLAUDE.md nothing is saved until the user has seen the numbers on
an editable list, the screen is headed `ESTIMATE — CHECK IT`, and every row
carries an `estimated` flag so nothing downstream can forget.

`lib/ai-food.ts` is pure — prompt in, parsed items out — because a model will
eventually return something malformed and the answer has to be "I couldn't read
that", never a plate of zeroes. What it guarantees, each tested and
mutation-checked:

- A row with no name or no calories is **dropped**, not logged as 0.
- A macro the model could not estimate stays `null`. Negative, non-numeric and
  absurd values (a single item over 20,000 kcal) are rejected the same way.
- Totals skip a macro nothing supplied rather than reporting `0 g`.
- Unparseable output is reported as unreadable, with the raw reply kept, and the
  user is pointed at the manual form.
- A markdown fence or a leading sentence is stripped, because models add both
  despite being told not to.

The meal is chosen from the time of day, so a morning entry lands in Breakfast.

**Vision.** `ChatMessage` takes an optional image, sent as content blocks
(Anthropic), `image_url` parts (OpenAI-compatible) or `inline_data` (Gemini).
`VISION_PROVIDERS` names the three that can actually see one; picking Photo on
OpenRouter, Hugging Face or a custom endpoint says so rather than sending a
photo that gets silently dropped and asking the model to describe it.

**Macros are nullable.** `food_logs.protein/fat/carb` used to be
`NOT NULL DEFAULT 0`, so a macro nobody estimated read as "this meal had no
fat". They are now nullable: `null` is "nobody knows", `0` is "the food has
none". Migration `0007` rebuilds the table and puts the truth back into rows the
AI estimator wrote, which recorded the unestimated macros in their note.

A day's total is the sum of what is known, and `DayFuelSummary.partial` flags
any macro where at least one log had no figure. Fuel shows that as a leading
`+`, so the number reads as a floor rather than a complete total, and an
individual log with an unknown macro shows a dash.

### Recipes

The AI screen's third mode. Up to five photos — a page, a packet, the pan — read
as **one** recipe, so an ingredient appearing in two photos is not counted
twice, or a link to a recipe page. Ingredients come back per serving, using the
serving count the user gives, so one serving is what gets logged. The link
prompt tells the model to say it could not open the page rather than answering
from memory of a similar recipe, which would be a recipe the user never chose.

### Hugging Face models

Hugging Face hosts hundreds of thousands of models and the set its router can
actually serve changes weekly, so there is no hardcoded list. `lib/hf-models.ts`
asks the router at open time and `components/HfModelPicker.tsx` makes it
searchable. Sending the user's token returns what *they* can reach, which is
the more useful answer. The model field stays typeable, so failing to load the
list costs a convenience, not the feature.

### The app icon

The logo is the wordmark: `128BIT` over `FIT` in Silkscreen, white on black.
`scripts/` does not generate it — it was produced once from the bundled font at
the largest whole-pixel size that fits each icon's safe area, so the letters
stay crisp rather than anti-aliasing to mush. The adaptive foreground uses a
tighter safe area (52% vs 72%) because Android masks the outer third away and a
clipped wordmark is unreadable.

### Importing a history from another app

Settings → **Import exercises**. Three shapes: Hevy's CSV, a generic CSV with a
date and an exercise column, and a JSON export (this app's, or an array of
sets).

`lib/import/parse.ts` is pure — text in, rows out — and holds a hand-written
CSV reader, because quoted fields, doubled quotes, embedded newlines and
Excel's BOM all appear in real exports. What it guarantees, each tested and
mutation-checked:

- A row that cannot be read is **reported with its line number and reason**,
  never silently dropped. An importer that quietly loses half a training
  history is worse than one that refuses the file.
- A field that is absent stays `null` — an unsupplied weight or RPE is not 0.
- The weight unit comes from the column name (`weight_kg` / `weight_lbs`) or a
  unit column, and is left `null` rather than assumed.
- A slashed date is resolved when one field is over 12; otherwise the US
  reading is taken, which is what these exports use.

The screen reads the file and shows what it found — set count, exercises, days,
and every unreadable row — before anything is written. A history import is not
reversible from inside the app.

`db/import-sets.ts` writes it: one completed session per imported day, so the
muscle map, history and PRs see the same shape as sets logged in the app. An
exercise the library does not have is **created**, not dropped, with no muscles
attached — guessing them would colour the muscle map with training that may not
have happened. Sessions carry an `[imported YYYY-MM-DD]` marker, so running the
same file twice leaves the second run alone rather than doubling the history.

### Sharing a food back

A custom food can be offered to the shared database. There is no server and
there should not be a secret in a sideloaded app, so `lib/community-food.ts`
posts nothing: it builds a pre-filled GitHub issue and opens it in the browser,
and the user submits it under their own account. Nothing leaves the phone until
they press the button on GitHub, and it is opt-in per food.

The payload is built field by field rather than spread from the row, so a
future column on `foods` cannot start leaking into a public issue just by
existing. Tested: the local photo path, internal ids and any unrecognised
nutrient key stay out, and an unknown nutrient is sent as `null` rather than 0.

### Identifying equipment from a photo

Exercise library → **Add exercise**. Photograph the machine and the model says
what it is, which muscles it works, and how to use it. It fills the form in; it
saves nothing. A model looking at an unfamiliar machine can be confidently
wrong, and a wrongly tagged exercise colours the wrong muscles on the map.

`lib/ai-exercise.ts` is pure and holds the part that matters: **mapping the
model's muscle names onto the app's 17 groups**. A model will answer
"pectoralis major", "rear delts" or "gastrocnemius"; the map has artwork for a
closed list and a free-text muscle would simply never light up. Synonyms are
mapped, anything unmappable is **reported to the user, not dropped silently**,
and a muscle cannot end up in both the primary and secondary list.

`gluteus medius` maps to `abductors`, not `glutes` — they are different regions
on the map and colouring the wrong one is worse than colouring neither.

### openGym backups

openGym writes its own shape and needs its own reader (`lib/import/opengym.ts`):

```
{ unit: "lb",
  customEx: [{ id, n, ... }],
  workouts: [{ d: "2024-06-24", start, name,
               entries: [{ id, sets: [{ w, r, done }] }] }] }
```

Two awkward parts:

- **An entry names its exercise by id, not by name.** Custom exercises are
  defined in `customEx`; the built-in ones reference openGym's own catalogue,
  which the backup does not contain. Those import as `openGym 0218` so the
  sets, dates, weights and reps — the part worth having — are not thrown away
  over a missing label. The import screen says how many came in numbered.
- **The weight unit is one top-level setting**, not per set.

Sets with `done: false` are planned-but-not-performed and are skipped:
importing them would invent training that did not happen.

Checked against a real 736 KB backup: 4,263 sets over 196 days, nothing
skipped, 31 of 114 exercises named from `customEx`.

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

### Onboarding and body data

- Settings keys: `onboarding_complete`, `sex`, `birthday`, `height_cm`, `units`
- `lib/body.ts` — age, unit conversion, Mifflin–St Jeor BMR, TDEE and the target
  suggestions. The calorie floor depends on it.
- Gate: `components/OnboardingGate.tsx` → `app/onboarding/index.tsx`
  (Basics → Goals → Done). Basics collects the imperial/metric choice, sex,
  birthday, height and weight.
- Birthday uses the OS date picker (`components/DateField.tsx`). `lib/birthday.ts`
  is pure and tested: it builds the ISO string from the **local** calendar, not
  `toISOString()`, and rejects dates that do not exist rather than letting `Date`
  roll `2026-02-31` into March.

**The pixel avatar is gone.** It was cosmetic, it did not look good at any size,
and the muscle map is the figure that means something because it is driven by
logged sets. `lib/avatar.ts` was split when it went: the palettes and body-type
metrics were deleted and the energy maths moved to `lib/body.ts`.
