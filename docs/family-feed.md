# 128bit family feed

Optional. Settings → **128bit family** signs in to the 128bit family account (Google, Apple
or email; the same account as 128bitPlay and Tracker; or a Supabase project of your own) and sends what you switch on to the family feed, where **128bit Tracker**
shows it on one timeline with your books, shows, Trakt history and the rest.

Code: `lib/family/events.ts` (what is sent, tested) and `lib/family/index.ts` (sign-in and
outbox). The feed's SQL is `supabase/family.sql` in 128bittracker; 128bitPlay's setup SQL
already includes it. Full schema: `docs/EVENTS.md` there.

## What goes up

| `type` | `id` | `data` | Switch |
|---|---|---|---|
| `workout.logged` | `fit-<session id>` | `kind: "strength"`, `name`, `minutes`, `exercises`, `sets` | Workouts |
| `workout.logged` | `fit-<session id>` | `kind: "cardio"`, `name` (sport), `minutes`, `km` (null if not measured) | Workouts |
| `health.day` | `fit-health-<YYYY-MM-DD>` | `date`, `steps`, `sleepMinutes`, `restingHeartRate`, `activeCalories`, `km` | Daily health totals |

- Every event has `app: "fit"`. Sending the same `id` again replaces it, so today's totals
  update in place. Deleting a workout deletes its event.
- Health totals go up only when the app reads them anyway (opening Home and so on), only for
  the last 7 days, and only when they changed. A missing reading stays `null`, never `0`.
  Weight is never sent.
- Nothing is collected while signed out. Signed in, events wait in an outbox in the local
  database (newest 500) and go up a few seconds later, or when there's signal again.
