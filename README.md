# Gym Tracker

A small strength-training log that runs as an installable PWA on GitHub Pages. There is no backend: data lives on the device, and you can move it around with JSON export and import.

## Features

- Pick a workout day (chest, back, legs… or a custom name).
- **Repeat last time:** a day starts pre-filled with the exercises, sets, reps and weights from your last session of that day. A day with no history starts as a blank template.
- Add exercises from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), filtered by muscle and equipment. Each one shows its instructions and images, plus a "Watch a demo" link that opens a YouTube search in a new tab.
- **Routines:** save a named list of exercises with optional target sets. You can build one from scratch on the Routines tab, or tap "Save as routine" during a workout. When you start a routine, each exercise you did the last time you ran it repeats those numbers; the others use the routine's targets.
- **Suggested routines** (Routines tab): 14 hand-picked starter routines, two per workout day, using only bodyweight, cable, dumbbell or kettlebell exercises. Each gives sets × target reps, and you choose the weight. "Add to my routines" copies one into your routines, where you can start or edit it. They're fixed lists in `js/suggestions.js`, not generated, and `tests/suggestions.test.js` checks each exercise against the dataset.
- **My equipment** (Settings): untick equipment you don't have, such as a barbell. Exercises that need it are hidden from the picker, and any existing routine or workout exercise that needs it is flagged.
- XP (10 per set with reps > 0), a daily streak, and three badges: first workout, 10 workouts, 7-day streak.
- Export and import all data as JSON.

## iPhone users: install to the Home Screen

When you use Safari without installing the app, Safari deletes this site's stored data (localStorage, IndexedDB, caches, service worker) after 7 days without a visit. Home Screen web apps are exempt ([WebKit](https://webkit.org/tracking-prevention/)). Open the site in Safari, tap **Share → Add to Home Screen**, and always launch the app from that icon. Keep exporting backups as well.

## Development

There is no build step. Serve the folder over HTTP:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Unit tests (pure logic in `js/logic.js`) run in headless Chrome:

```sh
scripts/run-tests.sh
```

You can also open `http://localhost:8000/tests/` in any browser.

End-to-end checks at phone width (needs `pip install playwright` and Chrome installed; start the server first):

```sh
python tests/e2e.py http://127.0.0.1:8000/ /tmp/shots
```

**When you deploy a change, bump `VERSION` in `sw.js`.** The service worker serves the app shell cache-first. Without the bump, installed copies keep running the old files.

## Layout

| Path | Purpose |
|---|---|
| `index.html`, `css/`, `js/app.js` | UI |
| `js/logic.js` | Pure logic: pre-fill (days and routines), XP, streaks, badges, export/import + schema migration, filters |
| `js/suggestions.js` | Suggested starter routines (static data) |
| `js/storage.js` | localStorage persistence (`schemaVersion` 2; v1 data and export files migrate automatically) |
| `data/exercises.json` | Vendored copy of free-exercise-db `dist/exercises.json` (Unlicense), fetched 2026-10-21 |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA install and offline support |

Exercise images load from `raw.githubusercontent.com` and are cached once viewed, so an exercise you have never opened has no images offline.

## Deploy (GitHub Pages)

1. Create a **public** repo, e.g. `gym-tracker`, and push this folder to `main`.
2. Go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, and set `main` / `(root)`.
3. The site goes live at `https://<user>.github.io/gym-tracker/`. Every path is relative, so any repo name works.
