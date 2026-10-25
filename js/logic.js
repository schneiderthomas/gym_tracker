// Pure logic: no DOM, no storage. Everything here is unit-tested in tests/logic.test.js.

export const SCHEMA_VERSION = 2;
export const XP_PER_SET = 10;
// Workout days offered by default, and the muscles each one covers.
export const DAY_PRESETS = {
  chest: ['chest'],
  back: ['lats', 'middle back', 'lower back', 'traps'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  shoulders: ['shoulders'],
  arms: ['biceps', 'triceps', 'forearms'],
  core: ['abdominals'],
  'full body': [],
};

export const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export function emptyData() {
  return { schemaVersion: SCHEMA_VERSION, sessions: [], draft: null, routines: [], settings: { excludedEquipment: [] } };
}

const normDay = (day) => String(day ?? '').trim().toLowerCase();
const clone = (v) => JSON.parse(JSON.stringify(v));

// Sessions are compared by date; on the same date the one later in the array wins
// (sessions are appended in the order they are saved).
function latestSessionFor(sessions, day) {
  let best = null;
  let bestIdx = -1;
  sessions.forEach((s, i) => {
    if (normDay(s.day) !== normDay(day)) return;
    if (!best || s.date > best.date || (s.date === best.date && i > bestIdx)) {
      best = s;
      bestIdx = i;
    }
  });
  return best;
}

// "Repeat last time": copy exercises/sets/reps/weights from the last session of this day,
// or a blank template if there is none. Returns a new draft that is safe to edit.
export function prefillFromLastSession(sessions, day) {
  const last = latestSessionFor(sessions, day);
  return {
    day,
    exercises: last ? copyExercises(last.exercises) : [],
    prefilledFrom: last ? last.date : null,
  };
}

const copyExercises = (exercises) =>
  clone(exercises).map(({ exerciseId, name, sets }) => ({ exerciseId, name, sets }));

// Start a workout from a saved routine. The routine decides which exercises; for each one
// done in the last session of this routine, sets/reps/weights repeat from that session,
// otherwise the routine's own target sets are used.
export function prefillFromRoutine(sessions, routine) {
  let last = null;
  sessions.forEach((s) => {
    if (s.routineId === routine.id && (!last || s.date >= last.date)) last = s;
  });
  const lastSets = new Map((last?.exercises ?? []).map((e) => [e.exerciseId, e.sets]));
  return {
    day: routine.name,
    routineId: routine.id,
    exercises: copyExercises(routine.exercises).map((e) =>
      (lastSets.has(e.exerciseId) ? { ...e, sets: clone(lastSets.get(e.exerciseId)) } : e)),
    prefilledFrom: last ? last.date : null,
  };
}

export function routineFromExercises(id, name, exercises) {
  return {
    id,
    name: name.trim(),
    exercises: copyExercises(exercises).map((e) => ({
      ...e, sets: e.sets.filter((s) => s.reps != null || s.weight != null),
    })),
  };
}

export function countLoggedSets(session) {
  return session.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => Number(s.reps) > 0).length, 0);
}

export function calcXp(sessions) {
  return sessions.reduce((xp, s) => xp + countLoggedSets(s) * XP_PER_SET, 0);
}

const dayNumber = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

// Streak = consecutive calendar days with at least one logged set.
// The current streak stays alive until a full day is missed (today or yesterday counts).
export function calcStreaks(sessions, today) {
  const days = [...new Set(
    sessions.filter((s) => countLoggedSets(s) > 0).map((s) => dayNumber(s.date)),
  )].sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const gap = dayNumber(today) - days[days.length - 1];
  return { current: gap <= 1 ? run : 0, longest };
}

export const BADGES = [
  { id: 'first-workout', label: 'First workout', desc: 'Log your first workout' },
  { id: 'ten-workouts', label: '10 workouts', desc: 'Log 10 workouts' },
  { id: 'seven-day-streak', label: '7-day streak', desc: 'Work out 7 days in a row' },
];

export function calcBadges(sessions, today) {
  const workouts = sessions.filter((s) => countLoggedSets(s) > 0).length;
  const { longest } = calcStreaks(sessions, today);
  const earned = {
    'first-workout': workouts >= 1,
    'ten-workouts': workouts >= 10,
    'seven-day-streak': longest >= 7,
  };
  return BADGES.map((b) => ({ ...b, earned: earned[b.id] }));
}

export function exportData(data) {
  return JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION }, null, 2);
}

// Parses and validates an export file. Throws with a readable message on bad input.
export function importData(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || !Number.isInteger(parsed.schemaVersion)) {
    throw new Error('File is not a Gym Tracker export (missing schemaVersion).');
  }
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`File is from a newer version of the app (schema ${parsed.schemaVersion}).`);
  }
  if (!Array.isArray(parsed.sessions)) {
    throw new Error('File has no sessions list.');
  }
  const validExercises = (list) => Array.isArray(list) && list.every((e) => e && Array.isArray(e.sets));
  for (const s of parsed.sessions) {
    if (!s || typeof s.date !== 'string' || !validExercises(s.exercises)) {
      throw new Error('File contains a malformed session.');
    }
  }
  // v1 -> v2: routines and settings were added; older files simply get the defaults.
  const routines = parsed.routines ?? [];
  if (!Array.isArray(routines) || !routines.every((r) => r && typeof r.id === 'string'
      && typeof r.name === 'string' && validExercises(r.exercises))) {
    throw new Error('File contains a malformed routine.');
  }
  const excluded = parsed.settings?.excludedEquipment ?? [];
  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: parsed.sessions,
    draft: parsed.draft ?? null,
    routines,
    settings: { excludedEquipment: Array.isArray(excluded) ? excluded.filter((x) => typeof x === 'string') : [] },
  };
}

export function youtubeSearchUrl(exerciseName) {
  return 'https://www.youtube.com/results?search_query='
    + encodeURIComponent(`${exerciseName} exercise form`);
}

export function imageUrl(relativePath) {
  return IMAGE_BASE + relativePath;
}

// filters: { muscle?, equipment? ('none' matches null equipment), text?, excludedEquipment? }
export function filterExercises(exercises, { muscle, equipment, text, excludedEquipment = [] } = {}) {
  const q = (text ?? '').trim().toLowerCase();
  return exercises.filter((e) =>
    (!muscle || e.primaryMuscles.includes(muscle))
    && (!equipment || (equipment === 'none' ? e.equipment == null : e.equipment === equipment))
    && !excludedEquipment.includes(e.equipment)
    && (!q || e.name.toLowerCase().includes(q)));
}
