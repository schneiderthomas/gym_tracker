import {
  prefillFromLastSession, prefillFromRoutine, routineFromExercises, countLoggedSets, calcXp, XP_PER_SET,
  calcStreaks, calcBadges, exportData, importData, youtubeSearchUrl, imageUrl, filterExercises, DAY_PRESETS,
} from './logic.js';
import { loadData, saveData, requestPersistence } from './storage.js';
import { SUGGESTED_ROUTINES, routineFromSuggestion } from './suggestions.js';

const MAX_RESULTS = 60;

let data = loadData();
let exerciseDb = null; // loaded lazily from data/exercises.json
let byId = new Map();
let tab = 'workout';
let picker = { muscle: '', equipment: '', text: '' };
let pickerScope = 'draft'; // which editor the picker adds to: 'draft' (workout) or 'routine'
let routineEdit = null; // routine being created/edited (UI state only, saved on "Save routine")
let openSuggestDay = null; // which day's suggestions are expanded on the Routines tab

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const excluded = () => data.settings.excludedEquipment;

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function persist() {
  if (!saveData(data)) toast('Could not save — storage is full or blocked. Export your data now.');
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3500);
}

async function loadExercises() {
  if (exerciseDb) return exerciseDb;
  const res = await fetch('data/exercises.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  exerciseDb = await res.json();
  exerciseDb.sort((a, b) => a.name.localeCompare(b.name));
  byId = new Map(exerciseDb.map((e) => [e.id, e]));
  return exerciseDb;
}

// In-app replacement for confirm(). Resolves true only when the OK button is pressed
// (Cancel and Escape resolve false). Cancel gets focus first.
function confirmDialog(message, { ok = 'OK', danger = false } = {}) {
  const dlg = $('#confirm');
  dlg.innerHTML = `
    <form method="dialog">
      <p>${esc(message)}</p>
      <div class="row end">
        <button class="ghost" value="cancel" autofocus>Cancel</button>
        <button class="${danger ? 'danger' : 'primary'}" value="ok">${esc(ok)}</button>
      </div>
    </form>`;
  dlg.returnValue = '';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

// The object an editor action applies to, from the nearest [data-scope] container.
function editTarget(el) {
  return el.closest('[data-scope]')?.dataset.scope === 'routine' ? routineEdit : data.draft;
}

// ---------- Rendering ----------

function render() {
  const xp = calcXp(data.sessions);
  const { current } = calcStreaks(data.sessions, todayLocal());
  $('#hud').innerHTML = `<span title="Total XP">⭐ ${xp} XP</span><span title="Current streak (days)">🔥 ${current}</span>`;
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab));
  const main = $('#main');
  if (tab === 'workout') main.innerHTML = data.draft ? renderDraft() : renderStart();
  if (tab === 'routines') main.innerHTML = routineEdit ? renderRoutineEditor() : renderRoutines();
  if (tab === 'history') main.innerHTML = renderHistory();
  if (tab === 'progress') main.innerHTML = renderProgress();
  if (tab === 'settings') main.innerHTML = renderSettings();
}

function knownDays() {
  const days = new Map(Object.keys(DAY_PRESETS).map((d) => [d, null]));
  for (const s of data.sessions) {
    if (s.routineId) continue; // routine workouts are listed under routines
    const key = s.day.trim().toLowerCase();
    if (!days.get(key) || s.date > days.get(key)) days.set(key, s.date);
  }
  return [...days.entries()];
}

function lastRoutineDate(routineId) {
  return data.sessions.reduce((d, s) => (s.routineId === routineId && (!d || s.date > d) ? s.date : d), null);
}

function renderStart() {
  const routines = data.routines.map((r) => {
    const last = lastRoutineDate(r.id);
    return `
      <button class="day" data-action="start-routine" data-id="${esc(r.id)}">
        <span class="day-name no-cap">${esc(r.name)}</span>
        <span class="muted">${r.exercises.length} exercise${r.exercises.length === 1 ? '' : 's'} · ${last ? `last: ${esc(formatDate(last))}` : 'not done yet'}</span>
      </button>`;
  }).join('');
  const chips = knownDays().map(([day, last]) => `
    <button class="day" data-action="choose-day" data-day="${esc(day)}">
      <span class="day-name">${esc(day)}</span>
      <span class="muted">${last ? `last: ${esc(formatDate(last))}` : 'no history yet'}</span>
    </button>`).join('');
  return `
    <h2>Start a routine</h2>
    ${routines ? `<div class="days">${routines}</div>` : '<p class="muted">No saved routines yet.</p>'}
    <button class="small" data-action="new-routine">+ New routine</button>
    <h2 class="spaced">Or choose a workout day</h2>
    <div class="days">${chips}</div>
    <form class="row" data-action="custom-day">
      <input name="day" placeholder="Other day name" maxlength="40" required aria-label="Other day name">
      <button>Start</button>
    </form>`;
}

function renderDraft() {
  const d = data.draft;
  const label = d.routineId ? 'routine' : 'session';
  const banner = d.editingId
    ? `Editing the ${esc(d.day)} session from ${esc(formatDate(d.date))}.`
    : d.prefilledFrom
      ? `Pre-filled from your last ${esc(d.day)} ${label} (${esc(formatDate(d.prefilledFrom))}). Edit anything.`
      : d.routineId
        ? `Starting ${esc(d.day)} from its saved targets. Edit anything.`
        : `No ${esc(d.day)} history yet: add exercises below.${
          SUGGESTED_ROUTINES.some((s) => s.day === d.day)
            ? ` Or <button class="link" data-action="show-suggestions" data-day="${esc(d.day)}">see suggested ${esc(d.day)} routines</button>.`
            : ''}`;
  return `
    <div data-scope="draft">
      <h2 class="${d.routineId ? '' : 'cap'}">${esc(d.day)}</h2>
      <p class="banner">${banner}</p>
      ${renderExerciseList(d.exercises)}
      <button class="wide" data-action="open-picker">+ Add exercise</button>
      <div class="row end">
        ${d.editingId ? '' : '<button class="ghost small" data-action="save-as-routine">Save as routine</button>'}
        <button class="ghost" data-action="discard">${d.editingId ? 'Cancel edit' : 'Discard'}</button>
        <button class="primary" data-action="finish">${d.editingId ? 'Save changes' : 'Finish workout'}</button>
      </div>
    </div>`;
}

function renderExerciseList(exercises) {
  return exercises.map((e, i) => renderExerciseCard(e, i)).join('') || '<p class="muted">No exercises yet.</p>';
}

function renderExerciseCard(e, i) {
  const info = byId.get(e.exerciseId);
  const missing = info?.equipment && excluded().includes(info.equipment)
    ? `<p class="warn">Needs ${esc(info.equipment)}, which isn't in your equipment.</p>` : '';
  const sets = e.sets.map((s, j) => `
    <div class="set" data-ex="${i}" data-set="${j}">
      <span class="set-n">${j + 1}</span>
      <input type="number" inputmode="numeric" min="0" step="1" placeholder="reps" aria-label="Reps, set ${j + 1}"
        data-field="reps" value="${s.reps ?? ''}">
      <input type="number" inputmode="decimal" min="0" step="any" placeholder="weight" aria-label="Weight, set ${j + 1}"
        data-field="weight" value="${s.weight ?? ''}">
      <button class="icon" data-action="remove-set" aria-label="Remove set ${j + 1}">✕</button>
    </div>`).join('');
  return `
    <section class="card">
      <div class="card-head">
        <h3>${esc(e.name)}</h3>
        <button class="icon" data-action="remove-exercise" data-ex="${i}" aria-label="Remove ${esc(e.name)}">🗑</button>
      </div>
      ${missing}
      <div class="set head"><span></span><span>Reps</span><span>Weight</span><span></span></div>
      ${sets}
      <button class="small" data-action="add-set" data-ex="${i}">+ Set</button>
      ${info ? renderExerciseInfo(info) : `<p><a href="${esc(youtubeSearchUrl(e.name))}" target="_blank" rel="noopener">▶ Watch a demo on YouTube</a></p>`}
    </section>`;
}

function renderExerciseInfo(info) {
  const imgs = info.images.map((p) => `<img src="${esc(imageUrl(p))}" alt="${esc(info.name)}" loading="lazy" crossorigin="anonymous" width="320" height="240">`).join('');
  const steps = info.instructions.map((t) => `<li>${esc(t)}</li>`).join('');
  return `
    <details>
      <summary>How to do it</summary>
      <p class="muted">${esc(info.primaryMuscles.join(', '))} · ${esc(info.equipment ?? 'no equipment')} · ${esc(info.level)}</p>
      <div class="imgs">${imgs}</div>
      <ol>${steps}</ol>
    </details>
    <p><a href="${esc(youtubeSearchUrl(info.name))}" target="_blank" rel="noopener">▶ Watch a demo on YouTube</a></p>`;
}

function suggestedMuscles() {
  if (pickerScope !== 'draft') return [];
  return DAY_PRESETS[data.draft.day.trim().toLowerCase()] ?? [];
}

function renderPicker() {
  const db = exerciseDb;
  const muscles = [...new Set(db.flatMap((e) => e.primaryMuscles))].sort();
  const equipment = [...new Set(db.map((e) => e.equipment).filter(Boolean))]
    .filter((x) => !excluded().includes(x)).sort();
  const opt = (v, label, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`;
  const suggested = suggestedMuscles();
  const results = filterExercises(db, { ...picker, excludedEquipment: excluded() });
  const hidden = filterExercises(db, picker).length - results.length;
  const list = results.slice(0, MAX_RESULTS).map((e) => `
    <li><button data-action="add-exercise" data-id="${esc(e.id)}">
      <span>${esc(e.name)}</span>
      <span class="muted">${esc(e.primaryMuscles.join(', '))} · ${esc(e.equipment ?? 'no equipment')}</span>
    </button></li>`).join('');
  return `
    <div class="picker-head">
      <h2>Add exercise</h2>
      <button class="icon" data-action="close-picker" aria-label="Close">✕</button>
    </div>
    <input type="search" id="pick-text" placeholder="Search by name" value="${esc(picker.text)}" aria-label="Search by name">
    <div class="row">
      <select id="pick-muscle" aria-label="Muscle group">${opt('', 'Any muscle', picker.muscle)}${muscles.map((m) => opt(m, m, picker.muscle)).join('')}</select>
      <select id="pick-equipment" aria-label="Equipment">${opt('', 'Any equipment', picker.equipment)}${equipment.map((m) => opt(m, m, picker.equipment)).join('')}${opt('none', 'none listed', picker.equipment)}</select>
    </div>
    ${suggested.length > 1 ? `<div class="chips">${suggested.map((m) => `<button class="chip" data-action="pick-muscle" data-muscle="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : ''}
    <p class="muted">${results.length} match${results.length === 1 ? '' : 'es'}${results.length > MAX_RESULTS ? ` (showing ${MAX_RESULTS}; narrow the filters)` : ''}${hidden > 0 ? ` · ${hidden} hidden that need equipment you don't have (<button class="link" data-action="goto-settings">change</button>)` : ''}</p>
    <ul class="results">${list}</ul>`;
}

function renderRoutines() {
  const cards = data.routines.map((r) => {
    const last = lastRoutineDate(r.id);
    return `
      <section class="card my-routine">
        <div class="card-head"><h3>${esc(r.name)}</h3></div>
        <p class="muted">${last ? `Last done ${esc(formatDate(last))}` : 'Not done yet'}</p>
        <ul class="compact">${r.exercises.map((e) => `<li>${esc(e.name)}${e.sets.length ? ` · ${e.sets.length} set${e.sets.length === 1 ? '' : 's'}` : ''}</li>`).join('') || '<li class="muted">No exercises</li>'}</ul>
        <div class="row end">
          <button class="ghost small danger-text" data-action="delete-routine" data-id="${esc(r.id)}">Delete</button>
          <button class="small" data-action="edit-routine" data-id="${esc(r.id)}">Edit</button>
          <button class="primary small" data-action="start-routine" data-id="${esc(r.id)}">Start</button>
        </div>
      </section>`;
  }).join('');
  return `
    <h2>Routines</h2>
    <p class="muted">Save a list of exercises with target sets. When you start a routine, it repeats your numbers from the last time you did it.</p>
    <button class="wide primary" data-action="new-routine">+ New routine</button>
    ${cards || '<p class="muted">No routines yet. Create one here, add a suggested one below, or tap "Save as routine" during a workout.</p>'}
    ${renderSuggestions()}`;
}

function renderSuggestions() {
  if (!exerciseDb) return '<h2 class="spaced">Suggested routines</h2><p class="muted">Loading…</p>';
  const groups = Object.keys(DAY_PRESETS).map((day) => {
    const cards = SUGGESTED_ROUTINES.filter((s) => s.day === day).map((s) => {
      const equipment = [...new Set(s.exercises.map(([id]) => byId.get(id)?.equipment))].filter(Boolean);
      const missing = equipment.filter((e) => excluded().includes(e));
      const added = data.routines.some((r) => r.sourceId === s.id);
      const lines = s.exercises.map(([id, sets, reps]) =>
        `<li>${esc(byId.get(id)?.name ?? id)} · ${sets} × ${reps}</li>`).join('');
      return `
        <section class="card">
          <div class="card-head"><h3>${esc(s.name)}</h3></div>
          <p class="muted cap">${esc(equipment.sort().join(' · '))}</p>
          ${missing.length ? `<p class="warn">Uses ${esc(missing.join(', '))}, which isn't in your equipment.</p>` : ''}
          <ul class="compact">${lines}</ul>
          <div class="row end">
            ${added
              ? '<button class="small" disabled>✓ In your routines</button>'
              : `<button class="primary small" data-action="add-suggestion" data-id="${esc(s.id)}">Add to my routines</button>`}
          </div>
        </section>`;
    }).join('');
    return `
      <details class="suggest-day" data-suggest-day="${esc(day)}"${openSuggestDay === day ? ' open' : ''}>
        <summary class="cap">${esc(day)}</summary>
        ${cards}
      </details>`;
  }).join('');
  return `
    <h2 class="spaced" id="suggested">Suggested routines</h2>
    <p class="muted">Starter routines that only use bodyweight, cable, dumbbell or kettlebell exercises. Sets × reps are starting targets: pick a weight you can lift with good form. Add one to your routines to start it or change it.</p>
    ${groups}`;
}

function renderRoutineEditor() {
  const r = routineEdit;
  return `
    <div data-scope="routine">
      <h2>${r.isNew ? 'New routine' : 'Edit routine'}</h2>
      <label class="field">Name
        <input id="routine-name" value="${esc(r.name)}" maxlength="40" placeholder="e.g. Push A" required>
      </label>
      <p class="muted">Sets are optional targets. Leave them blank to fill in during the workout.</p>
      ${renderExerciseList(r.exercises)}
      <button class="wide" data-action="open-picker">+ Add exercise</button>
      <div class="row end">
        ${r.isNew ? '' : `<button class="ghost danger-text" data-action="delete-routine" data-id="${esc(r.id)}">Delete routine</button>`}
        <button class="ghost" data-action="cancel-routine">Cancel</button>
        <button class="primary" data-action="save-routine">Save routine</button>
      </div>
    </div>`;
}

function renderHistory() {
  if (!data.sessions.length) return '<h2>History</h2><p class="muted">No workouts logged yet.</p>';
  const items = data.sessions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.date.localeCompare(a.s.date)) || (b.i - a.i))
    .map(({ s }) => {
      const n = countLoggedSets(s);
      const lines = s.exercises.map((e) => `<li>${esc(e.name)}: ${e.sets.map((x) => `${x.reps ?? '–'}×${x.weight ?? 0}`).join(', ') || 'no sets'}</li>`).join('');
      return `
        <section class="card">
          <div class="card-head">
            <h3><span class="${s.routineId ? '' : 'cap'}">${esc(s.day)}</span> · ${esc(formatDate(s.date))}</h3>
          </div>
          <p class="muted">${n} set${n === 1 ? '' : 's'} · +${n * XP_PER_SET} XP</p>
          <ul class="compact">${lines}</ul>
          <div class="row end">
            <button class="ghost small danger-text" data-action="delete-session" data-id="${esc(s.id)}">Delete</button>
            <button class="small" data-action="edit-session" data-id="${esc(s.id)}">Edit</button>
          </div>
        </section>`;
    }).join('');
  return `<h2>History</h2>${items}`;
}

function renderProgress() {
  const today = todayLocal();
  const xp = calcXp(data.sessions);
  const { current, longest } = calcStreaks(data.sessions, today);
  const badges = calcBadges(data.sessions, today).map((b) => `
    <li class="badge${b.earned ? ' earned' : ''}">
      <span class="badge-icon">${b.earned ? '🏅' : '🔒'}</span>
      <span><strong>${esc(b.label)}</strong><br><span class="muted">${esc(b.desc)}</span></span>
    </li>`).join('');
  return `
    <h2>Progress</h2>
    <div class="stats">
      <div><strong>${xp}</strong><span>XP (${XP_PER_SET} per set)</span></div>
      <div><strong>${current}</strong><span>day streak</span></div>
      <div><strong>${longest}</strong><span>best streak</span></div>
    </div>
    <h3>Badges</h3>
    <ul class="badges">${badges}</ul>`;
}

function renderEquipment() {
  if (!exerciseDb) return '<p class="muted">Loading equipment list…</p>';
  const counts = new Map();
  for (const e of exerciseDb) if (e.equipment) counts.set(e.equipment, (counts.get(e.equipment) ?? 0) + 1);
  const boxes = [...counts.keys()].sort().map((eq) => `
    <label class="check">
      <input type="checkbox" data-equipment="${esc(eq)}"${excluded().includes(eq) ? '' : ' checked'}>
      <span class="cap">${esc(eq)}</span> <span class="muted">(${counts.get(eq)})</span>
    </label>`).join('');
  return `<div class="checks">${boxes}</div>`;
}

function renderSettings() {
  return `
    <h2>Settings</h2>
    <h3>My equipment</h3>
    <p class="muted">Untick anything you don't have. Exercises that need it are hidden when you add exercises.</p>
    ${renderEquipment()}
    <h3 class="spaced">Backup</h3>
    <p>Your workouts and routines are stored only on this device. Export a backup regularly, and import it to move to a new phone.</p>
    <div class="row">
      <button class="primary" data-action="export">Export JSON</button>
      <label class="button">Import JSON<input type="file" accept="application/json,.json" id="import-file" hidden></label>
    </div>
    <h3 class="spaced">iPhone users: install to the Home Screen</h3>
    <p>Safari deletes website data after 7 days without a visit to the site. Apps added to the Home Screen are exempt
      (<a href="https://webkit.org/tracking-prevention/" target="_blank" rel="noopener">WebKit</a>).
      In Safari, tap Share → <em>Add to Home Screen</em>, then always open the app from that icon. Keep exporting backups anyway.</p>
    <h3 class="spaced">About</h3>
    <p class="muted">Exercise data and images: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a>
      (public domain, Unlicense). Demo links open a YouTube search.</p>`;
}

// ---------- Actions ----------

async function startDraft(draft) {
  if (data.draft && !(await confirmDialog('Replace the workout in progress?', { ok: 'Replace' }))) return false;
  data.draft = draft;
  persist();
  tab = 'workout';
  render();
  window.scrollTo(0, 0);
  return true;
}

function startDay(day) {
  day = day.trim().toLowerCase();
  if (day) startDraft(prefillFromLastSession(data.sessions, day));
}

async function finishDraft() {
  const d = data.draft;
  const exercises = d.exercises.map((e) => ({
    ...e,
    sets: e.sets.filter((s) => s.reps != null || s.weight != null),
  }));
  const candidate = { exercises };
  if (countLoggedSets(candidate) === 0 && !(await confirmDialog('No sets with reps logged. Save anyway? It will not count for XP or streaks.', { ok: 'Save anyway' }))) return;
  if (d.editingId) {
    const idx = data.sessions.findIndex((s) => s.id === d.editingId);
    if (idx >= 0) data.sessions[idx] = { ...data.sessions[idx], exercises };
  } else {
    const session = { id: newId(), day: d.day, date: todayLocal(), exercises };
    if (d.routineId) session.routineId = d.routineId;
    data.sessions.push(session);
  }
  const gained = countLoggedSets(candidate) * XP_PER_SET;
  data.draft = null;
  persist();
  tab = 'progress';
  render();
  toast(d.editingId ? 'Session updated.' : `Workout saved. +${gained} XP`);
}

function saveRoutine() {
  const r = routineEdit;
  if (!r.name.trim()) { toast('Give the routine a name.'); $('#routine-name')?.focus(); return; }
  const saved = routineFromExercises(r.id, r.name, r.exercises);
  const idx = data.routines.findIndex((x) => x.id === r.id);
  if (idx >= 0) data.routines[idx] = saved; else data.routines.push(saved);
  persist();
  routineEdit = null;
  tab = 'routines';
  render();
  toast(`Routine "${saved.name}" saved.`);
}

async function openPicker(scope) {
  pickerScope = scope;
  try {
    await loadExercises();
  } catch (err) {
    toast(`Could not load exercises (${err.message}).`);
    return;
  }
  const suggested = suggestedMuscles();
  picker = { muscle: suggested[0] ?? '', equipment: '', text: '' };
  $('#picker').innerHTML = renderPicker();
  $('#picker').showModal();
}

function refreshPicker() {
  const dlg = $('#picker');
  const focusedId = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  dlg.innerHTML = renderPicker();
  if (focusedId) {
    const el = document.getElementById(focusedId);
    el?.focus();
    if (caret != null && el?.setSelectionRange) el.setSelectionRange(caret, caret);
  }
}

function exportFile() {
  const blob = new Blob([exportData(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-tracker-${todayLocal()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importFile(file) {
  try {
    const imported = importData(await file.text());
    if (!(await confirmDialog(`Replace all data on this device with ${imported.sessions.length} session(s) and ${imported.routines.length} routine(s) from the file?`, { ok: 'Replace', danger: true }))) return;
    data = imported;
    routineEdit = null;
    persist();
    render();
    toast('Import complete.');
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
}

const actions = {
  'choose-day': (el) => startDay(el.dataset.day),
  'start-routine': async (el) => {
    const r = data.routines.find((x) => x.id === el.dataset.id);
    if (await startDraft(prefillFromRoutine(data.sessions, r))) loadExercises().then(render).catch(() => {});
  },
  'show-suggestions': (el) => {
    openSuggestDay = el.dataset.day;
    routineEdit = null;
    tab = 'routines';
    render();
    loadExercises().then(() => {
      render();
      document.querySelector(`[data-suggest-day="${CSS.escape(openSuggestDay)}"]`)?.scrollIntoView({ block: 'start' });
    }).catch(() => {});
  },
  'add-suggestion': (el) => {
    const s = SUGGESTED_ROUTINES.find((x) => x.id === el.dataset.id);
    data.routines.push(routineFromSuggestion(s, byId, newId()));
    openSuggestDay = s.day;
    persist();
    render();
    toast(`"${s.name}" added to your routines.`);
  },
  'new-routine': () => {
    routineEdit = { id: newId(), name: '', exercises: [], isNew: true };
    tab = 'routines';
    render();
    $('#routine-name')?.focus();
  },
  'edit-routine': (el) => {
    const r = data.routines.find((x) => x.id === el.dataset.id);
    routineEdit = { ...JSON.parse(JSON.stringify(r)), isNew: false };
    render();
    loadExercises().then(render).catch(() => {});
  },
  'delete-routine': async (el) => {
    const r = data.routines.find((x) => x.id === el.dataset.id);
    if (!r) { routineEdit = null; render(); return; }
    if (!(await confirmDialog(`Delete the routine "${r.name}"? This can't be undone. Workouts you've already logged stay in History.`, { ok: 'Delete', danger: true }))) return;
    data.routines = data.routines.filter((x) => x.id !== r.id);
    if (routineEdit?.id === r.id) routineEdit = null;
    toast(`Routine "${r.name}" deleted.`);
    persist();
    render();
  },
  'cancel-routine': async () => {
    if (!(await confirmDialog('Discard changes to this routine?', { ok: 'Discard' }))) return;
    routineEdit = null;
    render();
  },
  'save-routine': () => saveRoutine(),
  'save-as-routine': () => {
    const name = prompt('Name for this routine:', data.draft.day);
    if (!name?.trim()) return;
    const r = routineFromExercises(newId(), name, data.draft.exercises);
    data.routines.push(r);
    data.draft.routineId = r.id;
    data.draft.day = r.name;
    persist();
    render();
    toast(`Routine "${r.name}" saved.`);
  },
  'open-picker': (el) => openPicker(el.closest('[data-scope]').dataset.scope),
  'close-picker': () => $('#picker').close(),
  'goto-settings': () => { $('#picker').close(); tab = 'settings'; render(); window.scrollTo(0, 0); },
  'pick-muscle': (el) => { picker.muscle = el.dataset.muscle; refreshPicker(); },
  'add-exercise': (el) => {
    const info = byId.get(el.dataset.id);
    const target = pickerScope === 'routine' ? routineEdit : data.draft;
    target.exercises.push({ exerciseId: info.id, name: info.name, sets: [{ reps: null, weight: null }] });
    if (pickerScope === 'draft') persist();
    $('#picker').close();
    render();
    toast(`Added ${info.name}`);
  },
  'remove-exercise': async (el) => {
    const target = editTarget(el);
    const e = target.exercises[el.dataset.ex];
    if (!(await confirmDialog(`Remove ${e.name}?`, { ok: 'Remove', danger: true }))) return;
    target.exercises.splice(el.dataset.ex, 1);
    persist();
    render();
  },
  'add-set': (el) => {
    const sets = editTarget(el).exercises[el.dataset.ex].sets;
    const last = sets[sets.length - 1];
    sets.push(last ? { ...last } : { reps: null, weight: null });
    persist();
    render();
  },
  'remove-set': (el) => {
    const row = el.closest('.set');
    editTarget(el).exercises[row.dataset.ex].sets.splice(row.dataset.set, 1);
    persist();
    render();
  },
  discard: async () => {
    if (!(await confirmDialog(data.draft.editingId ? 'Discard changes to this session?' : 'Discard this workout?', { ok: 'Discard', danger: true }))) return;
    data.draft = null;
    persist();
    render();
  },
  finish: () => finishDraft(),
  'edit-session': async (el) => {
    const s = data.sessions.find((x) => x.id === el.dataset.id);
    const started = await startDraft({
      day: s.day, exercises: JSON.parse(JSON.stringify(s.exercises)), prefilledFrom: null,
      editingId: s.id, date: s.date, ...(s.routineId ? { routineId: s.routineId } : {}),
    });
    if (started) loadExercises().then(render).catch(() => {});
  },
  'delete-session': async (el) => {
    if (!(await confirmDialog("Delete this workout from your history? This can't be undone, and its XP is removed.", { ok: 'Delete', danger: true }))) return;
    data.sessions = data.sessions.filter((x) => x.id !== el.dataset.id);
    persist();
    render();
  },
  export: () => exportFile(),
};

document.addEventListener('click', (ev) => {
  const navBtn = ev.target.closest('nav button');
  if (navBtn) {
    tab = navBtn.dataset.tab;
    render();
    window.scrollTo(0, 0);
    if (tab === 'settings' || tab === 'routines') {
      const t = tab;
      loadExercises().then(() => tab === t && render()).catch(() => {});
    }
    return;
  }
  const el = ev.target.closest('[data-action]');
  if (el && el.tagName !== 'FORM' && actions[el.dataset.action]) {
    ev.preventDefault();
    actions[el.dataset.action](el);
  }
});

document.addEventListener('submit', (ev) => {
  if (ev.target.dataset.action === 'custom-day') {
    ev.preventDefault();
    startDay(new FormData(ev.target).get('day'));
  }
});

// Text/number inputs: update state without re-rendering, so focus and the keyboard stay put.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset.field) {
    const row = t.closest('.set');
    const v = t.value === '' ? null : Number(t.value);
    editTarget(t).exercises[row.dataset.ex].sets[row.dataset.set][t.dataset.field] = Number.isFinite(v) ? v : null;
    persist();
  } else if (t.id === 'routine-name') {
    routineEdit.name = t.value;
  } else if (t.id === 'pick-text') {
    picker.text = t.value;
    refreshPicker();
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'pick-muscle') { picker.muscle = t.value; refreshPicker(); }
  if (t.id === 'pick-equipment') { picker.equipment = t.value; refreshPicker(); }
  if (t.id === 'import-file' && t.files[0]) importFile(t.files[0]);
  if (t.dataset.equipment) {
    const eq = t.dataset.equipment;
    const list = excluded().filter((x) => x !== eq);
    if (!t.checked) list.push(eq);
    data.settings.excludedEquipment = list;
    persist();
  }
});

// Remember which suggested-routines day is expanded so re-renders keep it open.
document.addEventListener('toggle', (ev) => {
  const day = ev.target.dataset?.suggestDay;
  if (!day) return;
  if (ev.target.open) openSuggestDay = day;
  else if (openSuggestDay === day) openSuggestDay = null;
}, true);

// Re-render if the day rolls over while the app is open (streak display).
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();
if (data.draft) loadExercises().then(render).catch(() => {});
else loadExercises().catch(() => {}); // warm the cache for offline use
requestPersistence();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
}
