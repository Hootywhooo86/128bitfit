# 128BIT FIT — project brief

Read this first. It's the standing context for this repo.

## What this is

A strength-training and nutrition tracker where the user's real progress drives a
pixel character they built. Android first, React Native / Expo.

The differentiator is **not** the character. It's that training and nutrition live in
the same app, so the coach can say "your bench stalled and you're 32g under on protein
on training days" — something no split-app setup can do.

## Non-negotiables

These are product constraints, not preferences. Don't quietly trade them away.

1. **Logging a set takes under three seconds.** Last session's weights are pre-filled.
   Every feature competes against this; if something slows logging down, it loses.
2. **Nothing free becomes paid later.** The free tier is published and does not shrink.
   This is the single most common way fitness apps lose their users' goodwill.
3. **Full data export, always.** CSV and JSON. If the schema can't dump cleanly, the
   schema is wrong.
4. **Offline-first.** SQLite is the source of truth for a live session. Gyms have no
   signal. The UI never waits on the network.
5. **No simulated data in a shipping path.** If Health Connect is unavailable or the
   user declined, show an empty state. Never estimate a number and present it as a
   measurement. (The original prototype did this and it's why it was thrown away.)
6. **Calorie floors are enforced in code.** Targets never drop below the higher of the
   user's BMR or the standard minimum, whatever rate they pick. Deficit capped at 25%
   of TDEE. No user setting overrides this.

## First run and empty states

Every number in the prototype is seeded demo data. **On a real first launch, none of
it exists.** Build the empty states deliberately — they are the first thing a new user
sees and they are where the app earns or loses trust.

**Zero and "no data" are different things. Never conflate them.**

| Situation | Show |
| --- | --- |
| Health Connect connected, no steps yet today | `0` — that's a real reading |
| Health Connect not connected / permission declined | "Not connected" + a way to connect |
| Health Connect unavailable on this device | "Not available on this phone" |
| Weight never logged | "Log your first weigh-in", not `0 lbs` |
| No sessions yet | "No workouts yet" + Start workout, not `0 workouts` |
| No food logged today | Empty ring showing the target, not a filled `0` |

A `0` claims a measurement was taken and came back zero. A dash or a prompt says none
was taken. Getting this wrong is the same class of mistake as the original prototype's
fake Health Connect sync.

**What a brand-new user's screens should contain:**

- **Home** — no rings filled, no streak, no weight journey bar. A single clear next
  action: create your character, then set your targets.
- **Train** — no schedule, no history, no PRs. The exercise library is the one thing
  that *is* populated, because it ships with the app. Lead with it.
- **Fuel** — calorie ring shows the target with nothing consumed. Food search works
  offline from day one; that's the win to surface.
- **Coach** — nothing to say yet, and it should say so plainly rather than inventing
  encouragement. Something like: "Log a couple of sessions and I'll have something
  useful to tell you."
- **Progress / muscle map** — everything grey. The map with no colour is honest and it
  also motivates: it visibly wants filling in.

**Derived numbers need a minimum before they mean anything.** Don't show a 7-day weight
trend from one weigh-in, a TDEE estimate from three days of logging, or a "volume vs
last week" from a single session. Say what's still needed: "two more weigh-ins for a
trend". The prototype's weight screen already does this — carry the pattern everywhere.

**Seed nothing.** No sample workouts, no demo foods, no placeholder character stats.
An empty app that tells the truth beats a full one that lies.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Expo (React Native), SDK 54+, dev builds not Expo Go |
| Language | TypeScript |
| Local DB | expo-sqlite + Drizzle ORM |
| Sync | Supabase (Postgres + Auth + row-level security) |
| State | Zustand |
| Sprites | react-native-skia |
| Health | react-native-health-connect (Android), HealthKit later |
| Camera | expo-camera (barcode + photos) |
| Billing | RevenueCat |
| Notifications | expo-notifications |

Design a single `HealthProvider` interface with `readDays()` / `writeEntries()` so the
iOS HealthKit implementation slots in behind it later.

## Data sources

Build commands, generated-asset sizes, record shapes, the USDA API constraints
that must not regress, and the app file map live in
[`docs/data-pipeline.md`](docs/data-pipeline.md).

**Exercises — done, free, public domain**
- `free-exercise-db` (yuhonas). 876 exercises, name / primary + secondary muscles /
  equipment / category / level / instructions / image paths.
- Images: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<path>`
- Run `scripts/build-exercise-db.mjs` to fetch and normalise.

**Food — to build**
- **USDA FoodData Central** — public domain, free API key from api.data.gov.
  Foundation Foods + SR Legacy. Bundle offline. Full micronutrients.
  Run `scripts/build-food-db.mjs`.
- **Open Food Facts** — 4.6M barcoded products, live lookup at runtime, cache results.
  ⚠️ **ODbL, share-alike.** Per-barcode lookups are the intended use. Do NOT bulk-ingest
  into a proprietary database without a lawyer looking at it first.
- **Nutritionix** — paid, restaurant and branded items. This is the gap that loses
  users. Offer it as a user-supplied API key rather than eating the cost.

**Licences to respect**
- openGym is **AGPL**. Read it for ideas, don't copy code.
- wger is **AGPL**. Fine to call over its API, risky to bundle.

## AI

Bring-your-own-key is a first-class path, not a fallback. Supported providers:
Anthropic, Google AI Studio, OpenAI, xAI, Hugging Face, OpenRouter, Together AI,
Ollama, custom OpenAI-compatible endpoint, on-device.

Keys are stored with `expo-secure-store` and sent straight to the provider. They never
touch our servers.

Coach prompts get a pre-computed summary (~1,500 tokens), never the raw database.
The coach must be willing to say a plan is fine — a coach that finds a problem every
time is noise.

**Hard limits in the coach's system prompt:** no diagnosing, no rehab programming, no
advice on medication. Never recommend a target below the calorie floor regardless of
what the user asks for. If logged behaviour or stated goals suggest disordered eating,
step back and point to a professional rather than optimising the plan.

## Where the prototype fits

`prototype/app-shell.html` is a complete, working, single-file mock of the whole app —
every screen, real navigation, the 876-exercise database embedded. It is the visual and
behavioural spec. Port from it; don't ship it.

Visual rules it establishes:
- Monochrome UI. **Colour only ever means data.**
- The only colour in the app is muscle load: yellow (1–3 sets) → orange (4–7) → red (8+),
  plus red for over-target. An accent colour is user-selectable (paid) and must never
  bleed into the muscle heat scale.
- Pixel font (Silkscreen) for section labels and headers only. Body text is Inter.
- The character is a hand-authored 28×44 sprite grid rendered at 2×, not procedural shapes.

## Build order

1. Scaffold Expo + SQLite + Drizzle. Port the schema from the build spec.
2. Exercise database → bundled asset → searchable library.
3. Live session logging: routines, sets, rest timer with a **scheduled OS notification**
   (not a JS timer — it must fire with the screen off).
4. Food database + barcode.
5. Health Connect.
6. Coach.
7. Supabase sync, RevenueCat, importers (Strong / Hevy / MyFitnessPal / Cronometer).

## House style for code in this repo

- Plain, direct naming. No clever abstractions before there are two call sites.
- Every network call has an offline path.
- Errors surface to the user in one honest sentence — never a silent no-op.
  (A dead button that does nothing is worse than one that says "not built yet".)
