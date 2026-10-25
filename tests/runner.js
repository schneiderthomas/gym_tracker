// Minimal zero-dependency test runner. Runs in any browser (and headless Chrome).
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertThrows(fn, msg = 'expected function to throw') {
  try { fn(); } catch { return; }
  throw new Error(msg);
}

export async function run() {
  const lines = [];
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      lines.push(`ok   ${t.name}`);
    } catch (err) {
      failed++;
      lines.push(`FAIL ${t.name}\n     ${err.message}`);
    }
  }
  lines.push('', `${passed} passed, ${failed} failed, ${tests.length} total`);
  lines.push(failed === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
  return lines.join('\n');
}
