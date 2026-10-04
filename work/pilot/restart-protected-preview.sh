#!/bin/sh
# 05-20: bygger skyddat läge och startar om den tillfälliga provservern på 3059.
# Vägrar alla andra portar. Stoppar bara en förhandsvisning som skriptet självt startat
# (PID-fil under det ignorerade provmålet). Vanlig 3012 rörs inte.
set -eu
PORT="${1:-}"
if [ "$PORT" != "3059" ]; then echo "REFUSED: endast port 3059 tillåts" >&2; exit 2; fi
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/work/pilot/targets/protected"
PIDFILE="$STATE/preview-$PORT.pid"
LOG="$STATE/preview-$PORT.log"
[ -d "$STATE" ] || { echo "REFUSED: provmålet saknas" >&2; exit 2; }
export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
if [ -f "$PIDFILE" ]; then
  OLD="$(cat "$PIDFILE")"
  # Endast vår egen process: kommandoraden måste vara förhandsvisningen på just denna port.
  if [ -n "$OLD" ] && ps -p "$OLD" -o command= 2>/dev/null | grep -q "run-mode.mjs preview --mode protected --port $PORT"; then
    kill "$OLD"
    for _ in $(seq 1 30); do ps -p "$OLD" >/dev/null 2>&1 || break; sleep 1; done
  fi
  rm -f "$PIDFILE"
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "REFUSED: port $PORT används av en process som skriptet inte startat" >&2; exit 3; fi
cd "$ROOT/web"
npm run build:protected >"$LOG.build" 2>&1 || { tail -20 "$LOG.build" >&2; exit 1; }
nohup node scripts/run-mode.mjs preview --mode protected --port "$PORT" >"$LOG" 2>&1 &
echo $! >"$PIDFILE"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health/db" >/dev/null 2>&1; then
    echo "{\"port\":$PORT,\"status\":\"READY\",\"revision\":\"$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('dist-protected/build-mode.json','utf8')).revision)")\"}"
    exit 0
  fi
  sleep 1
done
echo "FAILED: /api/health/db svarade inte" >&2; tail -20 "$LOG" >&2; exit 1
