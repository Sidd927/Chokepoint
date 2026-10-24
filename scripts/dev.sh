#!/usr/bin/env bash
# Start CHOKEPOINT backend (:8000) and frontend (:5173). Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=backend/.venv/bin/python
BACKEND_PORT="${CHOKEPOINT_PORT:-8000}"; FRONTEND_PORT=5173

[ -x "$PY" ] || { echo "Missing backend/.venv - run 'make setup' first." >&2; exit 1; }
"$PY" -c 'import sys; sys.exit(sys.version_info < (3, 11))' || { echo "backend/.venv must use Python >= 3.11 (re-run 'make setup')." >&2; exit 1; }
[ -d frontend/node_modules/.bin ] || { echo "Missing frontend/node_modules - run 'make setup' first." >&2; exit 1; }
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is in use. Find it with: lsof -nP -iTCP:$port -sTCP:LISTEN" >&2; exit 1
  fi
done

trap 'kill 0 2>/dev/null || true' EXIT INT TERM
PYTHONPATH=backend/src "$PY" -m uvicorn chokepoint.api.app:app --host 127.0.0.1 --port "$BACKEND_PORT" &
(cd frontend && VITE_PROXY_TARGET="http://127.0.0.1:$BACKEND_PORT" npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort) &
echo "Backend:  http://127.0.0.1:$BACKEND_PORT/api/v1/health"
echo "Frontend: http://127.0.0.1:$FRONTEND_PORT"
# bash 3.2 (macOS) has no 'wait -n': exit as soon as either child dies
while kill -0 $(jobs -p | tr '\n' ' ') 2>/dev/null; do sleep 1; done
echo 'A server process exited; stopping.' >&2; exit 1
