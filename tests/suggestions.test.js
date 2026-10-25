import { test, assert, assertEqual } from './runner.js';
import { DAY_PRESETS } from '../js/logic.js';
import { SUGGESTED_ROUTINES, SUGGESTED_EQUIPMENT, expandSuggestion, routineFromSuggestion } from '../js/suggestions.js';

const dbPromise = fetch('../data/exercises.json').then((r) => r.json());
const lookup = async () => new Map((await dbPromise).map((e) => [e.id, e]));

test('suggestions: every workout day has at least two suggested routines', () => {
  for (const day of Object.keys(DAY_PRESETS)) {
    const n = SUGGESTED_ROUTINES.filter((s) => s.day === day).length;
    assert(n >= 2, `${day} has ${n} suggestions`);
  }
});

test('suggestions: ids are unique and every routine has 4-6 exercises', () => {
  assertEqual(new Set(SUGGESTED_ROUTINES.map((s) => s.id)).size, SUGGESTED_ROUTINES.length);
  for (const s of SUGGESTED_ROUTINES) {
    assert(s.exercises.length >= 4 && s.exercises.length <= 6, `${s.id} has ${s.exercises.length} exercises`);
  }
});

test('suggestions: every exercise exists in the dataset', async () => {
  const byId = await lookup();
  const missing = SUGGESTED_ROUTINES.flatMap((s) => s.exercises.map(([id]) => id)).filter((id) => !byId.has(id));
  assertEqual(missing, []);
});

test('suggestions: only bodyweight, cable, dumbbell or kettlebell exercises', async () => {
  const byId = await lookup();
  assertEqual(SUGGESTED_EQUIPMENT, ['body only', 'cable', 'dumbbell', 'kettlebells']);
  const bad = SUGGESTED_ROUTINES.flatMap((s) => s.exercises.map(([id]) => byId.get(id)))
    .filter((e) => !SUGGESTED_EQUIPMENT.includes(e.equipment)).map((e) => `${e.id} (${e.equipment})`);
  assertEqual(bad, []);
});

test('suggestions: exercises work a muscle that belongs to the day (except full body)', async () => {
  const byId = await lookup();
  const bad = [];
  for (const s of SUGGESTED_ROUTINES.filter((x) => x.day !== 'full body')) {
    for (const [id] of s.exercises) {
      if (!byId.get(id).primaryMuscles.some((m) => DAY_PRESETS[s.day].includes(m))) bad.push(`${s.id}: ${id}`);
    }
  }
  assertEqual(bad, []);
});

test('suggestions: no exercise repeated within a routine', () => {
  for (const s of SUGGESTED_ROUTINES) {
    const ids = s.exercises.map(([id]) => id);
    assertEqual(new Set(ids).size, ids.length, s.id);
  }
});

test('expandSuggestion: names from the dataset, N sets of target reps with blank weight', () => {
  const byId = new Map([['A', { id: 'A', name: 'Alpha Press' }]]);
  const s = { id: 'x', day: 'chest', name: 'Test', exercises: [['A', 3, 10]] };
  assertEqual(expandSuggestion(s, byId), [
    { exerciseId: 'A', name: 'Alpha Press', sets: [{ reps: 10, weight: null }, { reps: 10, weight: null }, { reps: 10, weight: null }] },
  ]);
});

test('routineFromSuggestion: a new, editable routine that remembers where it came from', () => {
  const byId = new Map([['A', { id: 'A', name: 'Alpha Press' }]]);
  const s = { id: 'suggested-x', day: 'chest', name: 'Chest: test', exercises: [['A', 2, 8]] };
  assertEqual(routineFromSuggestion(s, byId, 'r1'), {
    id: 'r1',
    name: 'Chest: test',
    exercises: [{ exerciseId: 'A', name: 'Alpha Press', sets: [{ reps: 8, weight: null }, { reps: 8, weight: null }] }],
    sourceId: 'suggested-x',
  });
});
