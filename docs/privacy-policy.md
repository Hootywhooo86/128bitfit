# 128BIT FIT — Privacy Policy

**Last updated:** 21 September 2026

128BIT FIT is a training and nutrition tracker. This policy describes exactly
what the app does with your data. It is written against what the code actually
does; if the two ever disagree, the code is the bug.

## The short version

- **Your data stays on your phone.** Everything you log lives in a SQLite
  database on your device. The only exception is one you opt into: signing in to
  the 128bit family account and switching sharing on (see below).
- **We collect nothing.** No analytics, no telemetry, no crash reporting, no
  advertising identifiers. The app has no backend to send anything to.
- **You can take everything with you.** Settings → Export data writes your
  complete history as JSON and CSV files you control.

## What is stored, and where

All of it on your device only:

- Workouts: routines, sessions, exercises, sets, weights, reps, RPE, notes
- Nutrition: food and water logs, and your calorie, protein and water targets
- Body data: weigh-ins, and the height, birthday and sex you enter during setup
- Coach conversations: the questions you ask and the replies you receive
- Settings, including your character and display preferences

Deleting the app deletes this data. Your log is not backed up to any server, so
we cannot recover it for you — export first if you want a copy.

## The 128bit family account (optional)

Settings → 128bit family lets you sign in to the account shared by the 128bit
apps (Play, Tracker and FIT). Signing in shares nothing by itself. Two switches,
both off until you turn them on, decide what is sent to **your own family feed**:

- **Workouts:** each finished workout's name, length, number of exercises and
  sets, or a cardio session's sport, minutes and distance.
- **Daily health summary:** per day, steps, sleep minutes, resting heart rate,
  active calories and distance, read from Health Connect.

Only your account can read your feed; it is shown in 128bit Tracker's timeline.
Food logs, weight, photos, coach conversations and AI keys are never sent. The
feed is stored with Supabase. Turning a switch off stops sending; signing out
removes the sign-in from the phone. Your sign-in is kept in the phone's secure
storage and is never in an export.

## Health Connect (Android)

If you choose to connect it, the app requests these permissions:

| Permission | What it is used for |
| --- | --- |
| `android.permission.health.READ_STEPS` | Showing your step count for today on the Home screen |
| `android.permission.health.WRITE_EXERCISE` | Writing workouts you complete back to Health Connect, so other apps can see them |

Specifics:

- Connecting is **optional**. Every screen works without it; the app shows
  "Not connected" rather than inventing numbers.
- Steps are read **when you open the Home screen** and displayed there. They are
  not stored in the app's database and not sent anywhere.
- No health data is ever transmitted off your device by this app, and it is
  never used for advertising, sold, or shared with third parties.
- You can revoke access at any time in Health Connect, in Android Settings. The
  app will go back to showing "Not connected".

## When the app talks to the internet

Three cases, all of them either optional or triggered by something you do:

**1. Barcode scanning (Open Food Facts).** When you scan a barcode that is not
in the bundled USDA database, the barcode number is sent to Open Food Facts to
look up the product. Nothing else is sent — no identifiers, no other logs. The
result is cached on your device. Product data is © Open Food Facts
contributors, licensed ODbL.

**2. The AI Coach (only if you set it up).** The Coach is bring-your-own-key and
off until you add one. When you ask a question, the app sends a short summary of
your recent training and nutrition, plus your question, **directly to the
provider you chose** (Anthropic, OpenAI, Google, OpenRouter, or a custom
endpoint you name). It does not pass through any server of ours, because there
isn't one.

Your API key is stored in the Android Keystore via `expo-secure-store`. It is
never written to the app database, never logged, and never included in exports.
Whatever you send to a provider is then governed by that provider's own privacy
policy.

**3. Exercise images.** Illustrations for the exercise library are loaded from
GitHub as you browse. That request reveals your IP address to GitHub, as any web
request would.

There is no other network activity. The exercise and food databases ship inside
the app and work with no connection at all.

## Children

128BIT FIT is not directed at children under 13 and should not be used by them.

## Changes

Material changes to this policy will be reflected here with a new date. Because
the app has no servers and no accounts, we have no way to notify you directly —
this document is the record.

## Contact

Questions about this policy or your data: open an issue at
<https://github.com/Hootywhooo86/128bitfit>.
