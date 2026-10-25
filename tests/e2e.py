"""End-to-end smoke test at phone width, driving the system Chrome with Playwright.

Usage:
  pip install playwright            # in a venv; uses the installed Chrome, no browser download
  python tests/e2e.py <base_url> [screenshot_dir]

<base_url> must be a secure context (http://127.0.0.1:<port>/ or the https live site).
Run against a fresh browser profile: the script assumes no prior data.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') + '/'
shots = sys.argv[2] if len(sys.argv) > 2 else None
if shots:
    os.makedirs(shots, exist_ok=True)
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


def shot(page, name, full=False):
    if shots:
        page.screenshot(path=f'{shots}/{name}.png', full_page=full)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))

    # The only native dialog left in the app is the "Save as routine" name prompt.
    native = []

    def on_dialog(d):
        native.append(d.type)
        d.accept('Chest saved') if d.type == 'prompt' else d.dismiss()
    page.on('dialog', on_dialog)

    def confirm_ok():
        # The dialog's 'close' event (which runs the action) fires a task after [open] is removed,
        # so wait until the handler has run before checking results.
        page.wait_for_selector('#confirm[open] button[value="ok"]')
        page.evaluate("""() => new Promise((resolve) => {
            document.getElementById('confirm').addEventListener('close', () => setTimeout(resolve, 0), { once: true });
            document.querySelector('#confirm[open] button[value="ok"]').click();
        })""")

    def stored():
        return page.evaluate("JSON.parse(localStorage.getItem('gym-tracker-data') || 'null')")

    page.goto(base)
    page.wait_for_selector('.days')

    # ---- Manifest + service worker ----
    mres = page.request.get(base + 'manifest.webmanifest')
    m = mres.json()
    sizes = {i['sizes'] for i in m['icons']}
    check('manifest loads', mres.ok and m.get('name') and m.get('start_url') and m.get('display')
          and {'192x192', '512x512'} <= sizes, f"status={mres.status} sizes={sorted(sizes)}")
    for i in m['icons']:
        r = page.request.get(base + i['src'])
        check(f"icon {i['src']} ({i['purpose']})", r.ok and r.headers['content-type'] == 'image/png')
    # `ready` resolves once there is an active worker, which may still be 'activating'.
    sw = page.evaluate("""async () => {
        const r = await navigator.serviceWorker.ready;
        if (r.active.state !== 'activated') {
            await new Promise((res) => r.active.addEventListener('statechange', function f() {
                if (r.active.state === 'activated') { r.active.removeEventListener('statechange', f); res(); }
            }));
        }
        return { scope: r.scope, state: r.active.state }; }""")
    check('service worker registers & activates', sw['state'] == 'activated', json.dumps(sw))
    page.reload()
    page.wait_for_selector('.days')
    check('page controlled by service worker', page.evaluate('!!navigator.serviceWorker.controller'))

    # ---- Day workout: blank template, picker, logging ----
    shot(page, '01-start', True)
    page.click('button[data-day="chest"]')
    check('blank template when no history', 'No chest history yet' in page.inner_text('.banner'))
    page.click('[data-action="open-picker"]')
    page.wait_for_selector('#picker[open] .results li')
    check('picker muscle defaults to chest', page.input_value('#pick-muscle') == 'chest')
    page.select_option('#pick-equipment', 'barbell')
    meta = page.locator('.results li .muted').all_inner_texts()
    check('picker filters chest + barbell', meta and all('barbell' in x and 'chest' in x for x in meta), f'{len(meta)} results')
    page.fill('#pick-text', 'bench press - medium')
    shot(page, '02-picker')
    page.click('.results li button')

    page.fill('[data-ex="0"][data-set="0"] [data-field="reps"]', '8')
    page.fill('[data-ex="0"][data-set="0"] [data-field="weight"]', '60')
    page.click('[data-action="add-set"]')
    page.fill('[data-ex="0"][data-set="1"] [data-field="reps"]', '6')
    page.fill('[data-ex="0"][data-set="1"] [data-field="weight"]', '65')

    page.click('details summary')
    page.wait_for_function("() => [...document.querySelectorAll('.imgs img')].every(i => i.complete && i.naturalWidth > 0)", timeout=15000)
    check('exercise images load', page.locator('.imgs img').count() >= 1)
    check('instructions shown', page.locator('details ol li').count() > 0)
    yt = page.locator('a:has-text("Watch a demo")').first
    href, target = yt.get_attribute('href'), yt.get_attribute('target')
    check('YouTube link is a search link-out in new tab',
          href.startswith('https://www.youtube.com/results?search_query=') and target == '_blank', href)
    with ctx.expect_page() as newp:
        yt.click()
    yt_page = newp.value
    yt_page.wait_for_load_state('domcontentloaded')
    check('YouTube link opens', 'youtube.com/results' in yt_page.url, yt_page.url)
    yt_page.close()
    shot(page, '03-logging', True)

    page.click('[data-action="finish"]')
    hud = page.inner_text('#hud')
    check('XP awarded (2 sets x 10)', '20 XP' in hud and '🔥 1' in hud, hud.replace('\n', ' '))
    check('first-workout badge earned', page.locator('.badge.earned').count() == 1)
    shot(page, '04-progress', True)

    # ---- Repeat last time ----
    page.click('nav button[data-tab="workout"]')
    page.click('button[data-day="chest"]')
    vals = [page.input_value(f'[data-ex="0"][data-set="{s}"] [data-field="{f}"]') for s in (0, 1) for f in ('reps', 'weight')]
    check('repeat last time pre-fills sets/reps/weights', 'Pre-filled' in page.inner_text('.banner') and vals == ['8', '60', '6', '65'], str(vals))
    page.click('[data-action="discard"]')
    confirm_ok()

    # ---- Export / import ----
    page.click('nav button[data-tab="settings"]')
    with page.expect_download() as dl:
        page.click('[data-action="export"]')
    path = dl.value.path()
    exported = json.load(open(path))
    check('export has schemaVersion and session', exported['schemaVersion'] == 2 and len(exported['sessions']) == 1)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector('#main')
    page.click('nav button[data-tab="settings"]')
    page.set_input_files('#import-file', path)
    confirm_ok()
    page.wait_for_function("() => document.querySelector('#hud').textContent.includes('20 XP')")
    check('import restores data', True)

    # ---- Equipment ----
    page.wait_for_selector('input[data-equipment="barbell"]')
    page.uncheck('input[data-equipment="barbell"]')
    shot(page, '05-settings', True)
    page.reload()
    page.wait_for_selector('#main')
    page.click('nav button[data-tab="settings"]')
    page.wait_for_selector('input[data-equipment="barbell"]')
    check('equipment setting persists', not page.is_checked('input[data-equipment="barbell"]')
          and page.is_checked('input[data-equipment="dumbbell"]'))
    page.click('nav button[data-tab="workout"]')
    page.click('button[data-day="chest"]')
    page.wait_for_selector('.warn')
    check('existing barbell exercise flagged as missing equipment', 'Needs barbell' in page.inner_text('.warn'))
    page.click('[data-action="open-picker"]')
    page.wait_for_selector('#picker[open] .results li')
    opts = page.locator('#pick-equipment option').all_inner_texts()
    meta = page.locator('.results li .muted').all_inner_texts()
    check('picker hides barbell exercises & option', 'barbell' not in opts and meta
          and not any('barbell' in x for x in meta) and 'hidden that need equipment' in page.inner_text('#picker'))
    page.click('[data-action="close-picker"]')

    # ---- Routines ----
    page.click('[data-action="save-as-routine"]')
    page.click('[data-action="discard"]')
    confirm_ok()
    page.click('nav button[data-tab="routines"]')
    check('save as routine from workout', 'Chest saved' in page.inner_text('#main'))

    page.click('[data-action="new-routine"]')
    page.fill('#routine-name', 'Push A')
    page.click('[data-action="open-picker"]')
    page.wait_for_selector('#picker[open] .results li')
    check('picker in routine editor has no day-based default', page.input_value('#pick-muscle') == '')
    page.fill('#pick-text', 'dumbbell bench press')
    page.click('.results li button')
    page.fill('[data-scope="routine"] [data-ex="0"][data-set="0"] [data-field="reps"]', '10')
    page.fill('[data-scope="routine"] [data-ex="0"][data-set="0"] [data-field="weight"]', '20')
    shot(page, '06-routine-editor', True)
    page.click('[data-action="save-routine"]')
    check('new routine saved', page.locator('#main .my-routine').count() == 2 and 'Push A' in page.inner_text('#main'))
    shot(page, '07-routines', True)

    page.locator('.my-routine:has-text("Push A") [data-action="start-routine"]').click()
    r0 = [page.input_value(f'[data-ex="0"][data-set="0"] [data-field="{f}"]') for f in ('reps', 'weight')]
    check('routine start uses saved targets', 'saved targets' in page.inner_text('.banner') and r0 == ['10', '20'], str(r0))
    page.fill('[data-ex="0"][data-set="0"] [data-field="weight"]', '22')
    page.click('[data-action="finish"]')
    page.click('nav button[data-tab="workout"]')
    page.locator('[data-action="start-routine"]:has-text("Push A")').click()
    r1 = [page.input_value(f'[data-ex="0"][data-set="0"] [data-field="{f}"]') for f in ('reps', 'weight')]
    check('routine repeats last time', 'Pre-filled from your last Push A routine' in page.inner_text('.banner') and r1 == ['10', '22'], str(r1))
    page.click('[data-action="discard"]')
    confirm_ok()

    # ---- Delete routine with confirmation ----
    page.click('nav button[data-tab="routines"]')
    page.locator('.my-routine:has-text("Chest saved") [data-action="delete-routine"]').click()
    page.wait_for_selector('#confirm[open]')
    dlg_text = page.inner_text('#confirm')
    shot(page, '08-confirm-delete')
    check('delete shows in-app confirmation', 'Delete the routine "Chest saved"' in dlg_text
          and page.locator('#confirm button.danger').inner_text() == 'Delete', dlg_text.replace('\n', ' '))
    page.keyboard.press('Escape')
    page.wait_for_selector('#confirm:not([open])', state='attached')
    check('Escape keeps the routine', page.locator('#main .my-routine').count() == 2)
    page.locator('.my-routine:has-text("Chest saved") [data-action="delete-routine"]').click()
    page.click('#confirm[open] button[value="cancel"]')
    check('Cancel keeps the routine', page.locator('#main .my-routine').count() == 2 and len(stored()['routines']) == 2)
    page.locator('.my-routine:has-text("Chest saved") [data-action="delete-routine"]').click()
    confirm_ok()
    check('confirm deletes the routine', page.locator('#main .my-routine').count() == 1
          and 'Chest saved' not in page.inner_text('#main') and len(stored()['routines']) == 1)
    page.locator('.my-routine:has-text("Push A") [data-action="edit-routine"]').click()
    page.click('[data-scope="routine"] [data-action="delete-routine"]')
    confirm_ok()
    check('delete from routine editor', page.locator('#main .my-routine').count() == 0 and len(stored()['routines']) == 0)
    check('history kept after routine deleted', any(s['day'] == 'Push A' for s in stored()['sessions']))

    # ---- Suggested routines ----
    page.click('nav button[data-tab="workout"]')
    page.click('button[data-day="back"]')
    page.click('.banner [data-action="show-suggestions"]')
    page.wait_for_selector('details[data-suggest-day="back"][open] .card')
    check('blank day links to its suggested routines', page.locator('details[open]').count() == 1
          and page.locator('details[data-suggest-day="back"][open] .card').count() == 2)
    n_days = page.locator('details.suggest-day').count()
    n_cards = page.evaluate("document.querySelectorAll('details.suggest-day .card').length")
    check('suggestions for every day', n_days == 7 and n_cards == 14, f'{n_days} days, {n_cards} routines')
    shot(page, '11-suggested', True)
    page.locator('details[data-suggest-day="back"] .card:has-text("Back A") [data-action="add-suggestion"]').click()
    back_a = page.locator('details[data-suggest-day="back"] .card:has-text("Back A")')
    check('add suggestion to my routines', 'In your routines' in back_a.inner_text()
          and page.locator('details[data-suggest-day="back"][open]').count() == 1
          and [r['name'] for r in stored()['routines']] == ['Back A: dumbbells & bodyweight'])
    page.locator('.my-routine:has-text("Back A") [data-action="start-routine"]').click()
    confirm_ok()  # replaces the blank back-day workout in progress
    first = [page.input_value(f'[data-ex="0"][data-set="0"] [data-field="{f}"]') for f in ('reps', 'weight')]
    check('suggested routine starts with target reps, blank weight',
          page.locator('[data-scope="draft"] .card').count() == 4 and first == ['6', ''] and 'Chin-Up' in page.inner_text('#main'), str(first))
    page.click('[data-action="discard"]')
    confirm_ok()
    page.click('nav button[data-tab="settings"]')
    page.wait_for_selector('input[data-equipment="cable"]')
    page.uncheck('input[data-equipment="cable"]')
    page.click('nav button[data-tab="routines"]')
    page.wait_for_selector('details.suggest-day')
    if not page.locator('details[data-suggest-day="back"][open]').count():
        page.click('details[data-suggest-day="back"] > summary')
    check('suggestion flags equipment you do not have',
          'Uses cable' in page.locator('details[data-suggest-day="back"] .card:has-text("Back B")').inner_text()
          and 'Uses' not in page.locator('details[data-suggest-day="back"] .card:has-text("Back A")').inner_text())
    page.click('nav button[data-tab="settings"]')
    page.wait_for_selector('input[data-equipment="cable"]')
    page.check('input[data-equipment="cable"]')

    # ---- Layout ----
    for t in ('workout', 'routines', 'history', 'progress', 'settings'):
        page.click(f'nav button[data-tab="{t}"]')
        w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
        check(f'no horizontal scroll on {t}', w[0] <= w[1], str(w))
    page.click('nav button[data-tab="history"]')
    shot(page, '09-history', True)

    # ---- Offline ----
    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector('nav')
    page.click('nav button[data-tab="workout"]')
    page.click('button[data-day="legs"]')
    page.click('[data-action="open-picker"]')
    page.wait_for_selector('#picker[open] .results li')
    check('offline: shell + dataset load from cache', page.locator('.results li').count() > 0)
    shot(page, '10-offline')
    page.click('[data-action="close-picker"]')
    page.click('nav button[data-tab="routines"]')
    page.wait_for_selector('details.suggest-day')
    check('offline: suggested routines available', page.locator('details.suggest-day').count() == 7)
    ctx.set_offline(False)

    # ---- v1 data migrates in the browser ----
    v1 = {'schemaVersion': 1, 'draft': None, 'sessions': [{'id': 'old', 'day': 'legs', 'date': '2026-01-05',
          'exercises': [{'exerciseId': 'Barbell_Squat', 'name': 'Barbell Squat', 'sets': [{'reps': 5, 'weight': 100}]}]}]}
    page.evaluate("v => localStorage.setItem('gym-tracker-data', JSON.stringify(v))", v1)
    page.reload()
    page.wait_for_selector('#main')
    page.click('nav button[data-tab="history"]')
    check('v1 data loads and history shows', 'Barbell Squat' in page.inner_text('#main'))
    page.click('nav button[data-tab="workout"]')
    page.click('button[data-day="legs"]')
    s = stored()
    check('v1 data saved back as v2', s['schemaVersion'] == 2 and s['routines'] == [] and s['settings'] == {'excludedEquipment': []})

    check('only native dialog is the routine-name prompt', native == ['prompt'], str(native))
    check('no console/page errors', not errors, '; '.join(errors))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
