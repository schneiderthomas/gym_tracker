import { test, assert, assertEqual, assertThrows } from './runner.js';
import {
  SCHEMA_VERSION, emptyData, prefillFromLastSession, countLoggedSets,
  calcXp, XP_PER_SET, calcStreaks, calcBadges, exportData, importData,
  youtubeSearchUrl, imageUrl, filterExercises, prefillFromRoutine, routineFromExercises,
} from '../js/logic.js';

const session = (id, day, date, exercises) => ({ id, day, date, exercises });
const ex = (exerciseId, sets) => ({ exerciseId, name: exerciseId, sets });

// ---------- "Repeat last time" pre-fill ----------

test('prefill: no history for the day gives a blank template', () => {
  const data = emptyData();
  data.sessions = [session('a', 'legs', '2026-10-01', [ex('Squat', [{ reps: 5, weight: 100 }])])];
  const draft = prefillFromLastSession(data.sessions, 'chest');
  assertEqual(draft.day, 'chest');
  assertEqual(draft.exercises, []);
  assertEqual(draft.prefilledFrom, null);
});

test('prefill: copies exercises, sets, reps, weights from the latest session of that day', () => {
  const sessions = [
    session('old', 'chest', '2026-10-01', [ex('Bench', [{ reps: 8, weight: 60 }])]),
    session('new', 'chest', '2026-10-08', [
      ex('Bench', [{ reps: 8, weight: 62.5 }, { reps: 6, weight: 65 }]),
      ex('Fly', [{ reps: 12, weight: 14 }]),
    ]),
    session('other', 'legs', '2026-10-09', [ex('Squat', [{ reps: 5, weight: 100 }])]),
  ];
  const draft = prefillFromLastSession(sessions, 'chest');
  assertEqual(draft.prefilledFrom, '2026-10-08');
  assertEqual(draft.exercises, [
    { exerciseId: 'Bench', name: 'Bench', sets: [{ reps: 8, weight: 62.5 }, { reps: 6, weight: 65 }] },
    { exerciseId: 'Fly', name: 'Fly', sets: [{ reps: 12, weight: 14 }] },
  ]);
});

test('prefill: uses latest by date regardless of array order; same date uses later entry', () => {
  const sessions = [
    session('b', 'chest', '2026-10-08', [ex('B', [{ reps: 1, weight: 1 }])]),
    session('a', 'chest', '2026-10-02', [ex('A', [{ reps: 1, weight: 1 }])]),
    session('c', 'chest', '2026-10-08', [ex('C', [{ reps: 1, weight: 1 }])]),
  ];
  assertEqual(prefillFromLastSession(sessions, 'chest').exercises[0].exerciseId, 'C');
});

test('prefill: day match is case- and whitespace-insensitive', () => {
  const sessions = [session('a', 'Chest ', '2026-10-08', [ex('Bench', [{ reps: 8, weight: 60 }])])];
  assertEqual(prefillFromLastSession(sessions, 'chest').exercises.length, 1);
});

test('prefill: is a deep copy (editing the draft does not change history)', () => {
  const sessions = [session('a', 'chest', '2026-10-08', [ex('Bench', [{ reps: 8, weight: 60 }])])];
  const draft = prefillFromLastSession(sessions, 'chest');
  draft.exercises[0].sets[0].weight = 999;
  draft.exercises[0].sets.push({ reps: 1, weight: 1 });
  assertEqual(sessions[0].exercises[0].sets, [{ reps: 8, weight: 60 }]);
});

// ---------- XP ----------

test('xp: a logged set is one with reps > 0', () => {
  const s = session('a', 'chest', '2026-10-08', [
    ex('Bench', [{ reps: 8, weight: 60 }, { reps: 0, weight: 60 }, { reps: null, weight: null }]),
    ex('Push-up', [{ reps: 20, weight: 0 }]),
  ]);
  assertEqual(countLoggedSets(s), 2);
});

test('xp: XP_PER_SET per logged set, summed over all sessions', () => {
  const sessions = [
    session('a', 'chest', '2026-10-01', [ex('Bench', [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }])]),
    session('b', 'legs', '2026-10-02', [ex('Squat', [{ reps: 5, weight: 100 }])]),
  ];
  assertEqual(calcXp(sessions), 3 * XP_PER_SET);
  assertEqual(calcXp([]), 0);
});

// ---------- Streaks ----------

test('streak: none when there are no sessions', () => {
  assertEqual(calcStreaks([], '2026-10-21'), { current: 0, longest: 0 });
});

test('streak: consecutive calendar days, multiple sessions per day count once', () => {
  const sessions = ['2026-10-19', '2026-10-20', '2026-10-20', '2026-10-21']
    .map((d, i) => session(String(i), 'x', d, [ex('E', [{ reps: 1, weight: 0 }])]));
  assertEqual(calcStreaks(sessions, '2026-10-21'), { current: 3, longest: 3 });
});

test('streak: still current if last workout was yesterday; broken after a missed day', () => {
  const sessions = ['2026-10-19', '2026-10-20']
    .map((d, i) => session(String(i), 'x', d, [ex('E', [{ reps: 1, weight: 0 }])]));
  assertEqual(calcStreaks(sessions, '2026-10-21').current, 2);
  assertEqual(calcStreaks(sessions, '2026-10-22').current, 0);
  assertEqual(calcStreaks(sessions, '2026-10-22').longest, 2);
});

test('streak: longest is tracked across gaps and month boundaries', () => {
  const dates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-05'];
  const sessions = dates.map((d, i) => session(String(i), 'x', d, [ex('E', [{ reps: 1, weight: 0 }])]));
  assertEqual(calcStreaks(sessions, '2026-10-05'), { current: 1, longest: 4 });
});

test('streak: sessions with no logged sets do not count', () => {
  const sessions = [
    session('a', 'x', '2026-10-20', [ex('E', [{ reps: 1, weight: 0 }])]),
    session('b', 'x', '2026-10-21', [ex('E', [{ reps: 0, weight: 0 }])]),
  ];
  assertEqual(calcStreaks(sessions, '2026-10-21'), { current: 1, longest: 1 });
});

// ---------- Badges ----------

test('badges: first workout, 10 workouts, 7-day streak', () => {
  const mk = (n, consecutive) => Array.from({ length: n }, (_, i) => {
    const day = consecutive ? i + 1 : i * 2 + 1;
    return session(String(i), 'x', `2026-10-${String(day).padStart(2, '0')}`, [ex('E', [{ reps: 1, weight: 0 }])]);
  });
  const earned = (sessions) => calcBadges(sessions, '2026-10-31').filter(b => b.earned).map(b => b.id);
  assertEqual(earned([]), []);
  assertEqual(earned(mk(1, false)), ['first-workout']);
  assertEqual(earned(mk(10, false)), ['first-workout', 'ten-workouts']);
  assertEqual(earned(mk(7, true)), ['first-workout', 'seven-day-streak']);
});

// ---------- Export / import ----------

test('export/import: round-trip preserves all data', () => {
  const data = emptyData();
  data.sessions = [session('a', 'chest', '2026-10-08', [ex('Bench', [{ reps: 8, weight: 62.5 }])])];
  data.draft = { day: 'legs', exercises: [], prefilledFrom: null };
  const json = exportData(data);
  assertEqual(JSON.parse(json).schemaVersion, SCHEMA_VERSION);
  assertEqual(importData(json), data);
});

test('import: rejects invalid JSON, wrong shape, and newer schema versions', () => {
  assertThrows(() => importData('not json'));
  assertThrows(() => importData('{"hello":1}'));
  assertThrows(() => importData(JSON.stringify({ schemaVersion: SCHEMA_VERSION, sessions: 'nope' })));
  assertThrows(() => importData(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, sessions: [] })));
});

test('import: fills in missing optional fields', () => {
  const data = importData(JSON.stringify({ schemaVersion: SCHEMA_VERSION, sessions: [] }));
  assertEqual(data, emptyData());
});

// ---------- Dataset helpers ----------

test('youtube: builds a search-results URL, not a video ID', () => {
  const url = youtubeSearchUrl('Barbell Bench Press - Medium Grip');
  assert(url.startsWith('https://www.youtube.com/results?search_query='), url);
  assertEqual(new URL(url).searchParams.get('search_query'), 'Barbell Bench Press - Medium Grip exercise form');
});

test('images: relative path is prefixed with the dataset image base URL', () => {
  assertEqual(imageUrl('Air_Bike/0.jpg'),
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Air_Bike/0.jpg');
});

test('filter: by muscle (primary), equipment, and text; null equipment is handled', () => {
  const db = [
    { id: '1', name: 'Bench Press', primaryMuscles: ['chest'], equipment: 'barbell' },
    { id: '2', name: 'Dumbbell Fly', primaryMuscles: ['chest'], equipment: 'dumbbell' },
    { id: '3', name: 'Squat', primaryMuscles: ['quadriceps'], equipment: 'barbell' },
    { id: '4', name: 'Odd Thing', primaryMuscles: ['chest'], equipment: null },
  ];
  const ids = (f) => filterExercises(db, f).map(e => e.id);
  assertEqual(ids({}), ['1', '2', '3', '4']);
  assertEqual(ids({ muscle: 'chest' }), ['1', '2', '4']);
  assertEqual(ids({ muscle: 'chest', equipment: 'barbell' }), ['1']);
  assertEqual(ids({ equipment: 'none' }), ['4']);
  assertEqual(ids({ text: 'FLY' }), ['2']);
});

// ---------- Routines ----------

const routine = (id, name, exercises) => ({ id, name, exercises });

test('routine: with no history, starts from the routine\'s own exercises and target sets', () => {
  const r = routine('r1', 'Push A', [ex('Bench', [{ reps: 8, weight: 60 }]), ex('Dip', [{ reps: 10, weight: null }])]);
  const draft = prefillFromRoutine([], r);
  assertEqual(draft.day, 'Push A');
  assertEqual(draft.routineId, 'r1');
  assertEqual(draft.prefilledFrom, null);
  assertEqual(draft.exercises, r.exercises);
});

test('routine: uses sets from the last session of that routine for exercises done then', () => {
  const r = routine('r1', 'Push A', [ex('Bench', [{ reps: 8, weight: 60 }]), ex('Dip', [{ reps: 10, weight: null }])]);
  const sessions = [
    { ...session('s1', 'Push A', '2026-10-01', [ex('Bench', [{ reps: 8, weight: 62.5 }])]), routineId: 'r1' },
    { ...session('s2', 'Push A', '2026-10-08', [ex('Bench', [{ reps: 8, weight: 65 }, { reps: 7, weight: 65 }]), ex('Extra', [{ reps: 1, weight: 1 }])]), routineId: 'r1' },
    { ...session('s3', 'other', '2026-10-09', [ex('Bench', [{ reps: 1, weight: 200 }])]), routineId: 'r2' },
  ];
  const draft = prefillFromRoutine(sessions, r);
  assertEqual(draft.prefilledFrom, '2026-10-08');
  assertEqual(draft.exercises, [
    ex('Bench', [{ reps: 8, weight: 65 }, { reps: 7, weight: 65 }]), // from last time
    ex('Dip', [{ reps: 10, weight: null }]), // not done last time: routine target
  ]);
});

test('routine: draft is a deep copy of the routine', () => {
  const r = routine('r1', 'Push A', [ex('Bench', [{ reps: 8, weight: 60 }])]);
  prefillFromRoutine([], r).exercises[0].sets[0].weight = 999;
  assertEqual(r.exercises[0].sets[0].weight, 60);
});

test('routine: created from a workout copies exercises and sets, dropping empty sets', () => {
  const exercises = [ex('Bench', [{ reps: 8, weight: 60 }, { reps: null, weight: null }]), ex('Fly', [])];
  const r = routineFromExercises('r9', '  Chest day  ', exercises);
  assertEqual(r, routine('r9', 'Chest day', [ex('Bench', [{ reps: 8, weight: 60 }]), ex('Fly', [])]));
  r.exercises[0].sets[0].reps = 1;
  assertEqual(exercises[0].sets[0].reps, 8);
});

// ---------- Equipment ----------

test('filter: excluded equipment is hidden; exercises with no equipment listed are kept', () => {
  const db = [
    { id: '1', name: 'Bench Press', primaryMuscles: ['chest'], equipment: 'barbell' },
    { id: '2', name: 'Dumbbell Fly', primaryMuscles: ['chest'], equipment: 'dumbbell' },
    { id: '3', name: 'Push-up', primaryMuscles: ['chest'], equipment: 'body only' },
    { id: '4', name: 'Odd Thing', primaryMuscles: ['chest'], equipment: null },
  ];
  const ids = (f) => filterExercises(db, f).map(e => e.id);
  assertEqual(ids({ excludedEquipment: ['barbell', 'dumbbell'] }), ['3', '4']);
  assertEqual(ids({ excludedEquipment: [] }), ['1', '2', '3', '4']);
});

// ---------- Schema v2 ----------

test('import: v1 files migrate to the current schema with empty routines and settings', () => {
  const v1 = { schemaVersion: 1, sessions: [session('a', 'chest', '2026-10-08', [ex('Bench', [{ reps: 8, weight: 60 }])])], draft: null };
  const data = importData(JSON.stringify(v1));
  assertEqual(data.schemaVersion, SCHEMA_VERSION);
  assertEqual(data.sessions, v1.sessions);
  assertEqual(data.routines, []);
  assertEqual(data.settings, { excludedEquipment: [] });
});

test('export/import: round-trip preserves routines and equipment settings', () => {
  const data = emptyData();
  data.routines = [routine('r1', 'Push A', [ex('Bench', [{ reps: 8, weight: 60 }])])];
  data.settings.excludedEquipment = ['barbell'];
  assertEqual(importData(exportData(data)), data);
});

test('import: rejects malformed routines', () => {
  assertThrows(() => importData(JSON.stringify({ schemaVersion: SCHEMA_VERSION, sessions: [], routines: [{ name: 'x' }] })));
});
