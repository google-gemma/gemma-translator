#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Unified startup script for Gemma Audio Web App
# Launches litert-lm + backend/server.py (+ Vite dev server in dev mode)

set -e

PROD_MODE=0
for arg in "$@"; do
    if [ "$arg" = "--prod" ] || [ "$arg" = "-p" ]; then
        PROD_MODE=1
    fi
done

# Ensure PipeWire env is available for volume control (wpctl)
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Unbuffered Python stdout so server logs reach journald immediately
# (block-buffered prints previously hid request logs and hampered debugging)
export PYTHONUNBUFFERED=1

# Kill existing processes only if NOT running under systemd
# (systemd handles process lifecycle; killing ports here causes crash loops)
if [ -z "$INVOCATION_ID" ]; then
    lsof -ti:9379,3000,5173 | xargs kill -9 2>/dev/null || true
fi

LITERT_PORT=9379
API_PORT=3000
WEB_PORT=5173
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LITERT_CMD="${PROJECT_DIR}/venv/bin/litert-lm serve"
API_CMD="${PROJECT_DIR}/venv/bin/python3 ${PROJECT_DIR}/backend/server.py"
WEB_CMD="npm --prefix ${PROJECT_DIR}/frontend run dev"

CLEANING_UP=0
cleanup() {
    [ "$CLEANING_UP" -eq 1 ] && return
    CLEANING_UP=1
    echo "[start.sh] Shutting down..."
    # Kill only tracked child processes, not the entire process group
    for pid in $LITERT_PID $API_PID $WEB_PID; do
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    echo "[start.sh] All processes stopped."
}
trap cleanup EXIT TERM INT

# Wait for network (max 15s) - simpler check for macOS/Linux
echo "[start.sh] Waiting for network..."
for i in $(seq 1 15); do
    if ping -c 1 8.8.8.8 &> /dev/null; then
        echo "[start.sh] Network ready."
        break
    fi
    sleep 1
done

# Check node_modules
cd "${PROJECT_DIR}/frontend"
if [ ! -d "node_modules" ]; then
    echo "[start.sh] Installing npm dependencies in frontend..."
    npm install
fi
if [ "$PROD_MODE" -eq 1 ] && [ ! -d "dist" ]; then
    echo "[start.sh] Building production frontend assets..."
    npm run build
fi
cd "$PROJECT_DIR"

# Set system volume to max
echo "[start.sh] Setting system volume to max..."
wpctl set-volume @DEFAULT_AUDIO_SINK@ 1.0 || amixer sset Master 100% 2>/dev/null || true

# Start litert-lm in background
echo "[start.sh] Starting litert-lm..."
$LITERT_CMD &
LITERT_PID=$!

# Wait for litert-lm to be ready (max 60s)
echo "[start.sh] Waiting for litert-lm on port ${LITERT_PORT}..."
for i in $(seq 1 60); do
    if nc -z localhost ${LITERT_PORT} 2>/dev/null; then
        echo "[start.sh] litert-lm ready after ${i}s."
        break
    fi
    # Check if process died
    if ! kill -0 $LITERT_PID 2>/dev/null; then
        echo "[start.sh] litert-lm process died. Exiting."
        exit 1
    fi
    sleep 1
done

# Start API server
echo "[start.sh] Starting API server on port ${API_PORT}..."
$API_CMD &
API_PID=$!

if [ "$PROD_MODE" -eq 1 ]; then
    echo "[start.sh] Running in PRODUCTION mode (Vite dev server skipped)."
    echo "[start.sh] All services running."
    echo "[start.sh] LiteRT-LM PID: $LITERT_PID"
    echo "[start.sh] API Server PID: $API_PID"
    echo "[start.sh] Access the UI at http://localhost:${API_PORT}"
else
    # Start web UI server
    echo "[start.sh] Starting Web UI on port ${WEB_PORT}..."
    $WEB_CMD &
    WEB_PID=$!

    echo "[start.sh] All services running."
    echo "[start.sh] LiteRT-LM PID: $LITERT_PID"
    echo "[start.sh] API Server PID: $API_PID"
    echo "[start.sh] Web UI PID: $WEB_PID"
    echo "[start.sh] Access the UI at http://localhost:${WEB_PORT}"
fi

# Wait for any child to exit (then the trap will clean up the others)
wait -n
echo "[start.sh] A child process exited. Shutting down."
exit 1
