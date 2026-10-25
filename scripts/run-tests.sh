#!/usr/bin/env bash
# Run the browser unit tests in headless Chrome and print the report.
# Usage: scripts/run-tests.sh   (exit code 0 on pass, 1 on fail)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
port="${PORT:-8765}"
chrome="$(command -v google-chrome || command -v chromium-browser || command -v chromium)"

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
sleep 1

profile="$(mktemp -d)"
out="$("$chrome" --headless=new --disable-gpu --no-first-run --user-data-dir="$profile" \
  --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:$port/tests/index.html" 2>/dev/null)"
rm -rf "$profile"

report="$(printf '%s' "$out" | python3 -c 'import sys,re,html; m=re.search(r"<pre id=\"out\">(.*?)</pre>", sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else "NO REPORT (module failed to load?)")')"
echo "$report"
grep -q 'RESULT: PASS' <<<"$report"
