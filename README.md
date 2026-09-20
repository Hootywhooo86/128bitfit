# 128BIT FIT

Offline-first fitness + nutrition (Expo / React Native). Exercise & food databases live in SQLite after a one-time import from bundled JSON.

## Run the app

```bash
npm install
npx expo start
```

Then open in Expo Go (iOS/Android) or press `w` for web.

First launch shows import progress, then the tab shell: **Home / Train / Fuel / Coach**. Exercise Library is under Train (or Home).

## Offline databases

Bundled (committed) data:

| File | Approx |
|------|--------|
| `assets/data/exercises.json` | ~876 exercises |
| `assets/data/foods.json` | ~8114 foods |

On first launch the app imports these into SQLite once, keyed by checksums in `db/data-manifest.ts`. Re-launch skips re-import when checksums + counts match.

Verify import headlessly (no device):

```bash
npm run verify:import
```

### Regenerate JSON pipelines

```bash
npm run build:exercises
cp .env.example .env   # set FDC_API_KEY
npm run build:foods
# then refresh db/data-manifest.ts checksums if you change the JSON
```

See `CLAUDE.md` for USDA pipeline rules.

## Project layout

| Path | Role |
|------|------|
| `app/` | Expo Router screens (tabs + exercise library) |
| `db/` | Drizzle schema, client, idempotent import |
| `drizzle/` | Generated SQL migrations (bundled) |
| `assets/data/` | Source JSON for offline import |
| `scripts/` | Node pipelines to rebuild exercise/food JSON |

```bash
npm start                 # expo start
npm run typecheck
npm run db:generate       # after schema changes
npm run verify:import
```

## This slice (scope)

- Expo + TypeScript + Expo Router tabs
- expo-sqlite + Drizzle
- Idempotent import of exercises + foods
- Exercise Library (search, equipment/muscle filters, detail)
- **Train workout logger**: freestyle + starter routines, sets, rest timer, offline persistence, summary

Not yet: AI workout builder, nutrition logging, Health Connect, Coach AI.

## Platforms

Primary target is **iOS / Android via Expo Go** (`npx expo start`). `expo-sqlite` web needs extra WASM/COOP setup; prefer a device or simulator for this slice.
