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
