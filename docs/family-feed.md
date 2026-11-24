# 128bit family feed — what FIT sends

The 128bit family account is one sign-in shared by 128bitPlay, 128bit Tracker and
128BIT FIT, on the family Supabase project. Tracker's timeline reads the family
feed; its `docs/EVENTS.md` is the shared contract. Change them together.

## Signing in

Settings → **128bit family**: email + password, create an account, or Google
(Supabase's page with PKCE, returning to `bitfit://family-auth`). The session is
kept in the phone's secure storage, never in SQLite, so it is never exported.

For Google to come back to the app, `bitfit://family-auth` must be in the
project's **Authentication → URL Configuration → Redirect URLs**.

Code: `lib/family/client.ts` (auth + feed calls, pure, tested), `lib/family/session.ts`,
`lib/family/index.ts`, `app/settings/family.tsx`.

## What is sent — only with its switch on (both off by default)

| Switch | `type` | `id` | `data` |
|---|---|---|---|
| Workouts | `workout.logged` | `fit-workout-<session id>` | `kind: strength`, `name`, `minutes`, `exercises`, `sets` |
| Workouts | `workout.logged` | `fit-cardio-<session id>` | `kind: cardio`, `name` (sport), `minutes`, `km` |
| Daily health summary | `health.day` | `fit-health-<YYYY-MM-DD>` | `date`, `steps`, `sleepMinutes`, `restingHeartRate`, `activeCalories`, `km` |

- `app` is always `fit`. `null` means not measured, never 0; a day with nothing
  measured is not sent.
- Fixed ids mean re-sending replaces: each sync sends the last 14 days of
  workouts and the last 7 days of health, so a day's steps catch up and nothing
  needs a queue. Sent with `log_events`, up to 500 per call.
- Never sent: food, weight, photos, coach conversations, AI keys.

## When

After the screen settles on Home, a workout summary or a cardio summary, at most
every 15 minutes, and on **Sync now**. Offline or failing, it records one honest
sentence for the Settings screen and tries again next time. Logging never waits
on it.

## What FIT reads — bitrecipe's cookbook

Signed in to the same 128bit account, FIT reads the recipes bitrecipe syncs to
`bitrecipe_items` (kind `recipe`; bitrecipe's `supabase/bitrecipe-sync.sql`).
Read only: FIT never writes there, and row-level security limits it to this
account's own rows. Shared family cookbooks (`bitrecipe_book_recipes`) are not
read yet.

- **When:** each time Custom opens, in the background. Pulled by the server's
  `updated_at`, the same cursor bitrecipe uses, so edits arrive again and a
  deleted recipe arrives as a tombstone and leaves the list.
- **Kept:** title, servings, and each ingredient's `qty / qty2 / unit / item /
  raw / loose / missing` — not steps or photos. Stored in settings keys
  (`bitrecipe_recipes`, `bitrecipe_cursor`, `bitrecipe_added`), so the list
  shows offline and exports with everything else.
- **Adding one** (Custom → FROM BITRECIPE → a recipe): every ingredient is
  looked up in the bundled USDA foods first. A weight, or a volume with a known
  density (liquids, plus bitrecipe's own cup table for flour, sugar, butter…),
  multiplies straight into the per-100 g panel. Only lines that are not in the
  database, or have no weight ("2 chicken breasts"), go to the user's own AI in
  one request — and are labelled estimates on screen and in the saved food's
  description. "To taste" lines are not counted, and say so. Nothing saves while
  a line is waiting; it can be left out instead.
- **Saved as** an ordinary `foods` row with source `recipe`, per serving or per
  100 g (with the finished weight, which the screen asks for because cooking
  loses water). It stays in My recipes if bitrecipe later deletes the recipe.
  A recipe edited in bitrecipe after adding shows as changed; adding it again
  makes a new food and leaves the old one, which past logs point at.

Code: `lib/bitrecipe/` (amount, match, build, source — pure and tested; sync),
`db/bitrecipe-queries.ts`, `app/fuel/bitrecipe.tsx`, the FROM BITRECIPE section
of `app/fuel/custom-hub.tsx`.
