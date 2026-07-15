#!/bin/sh
set -e

uvicorn main:app --host 127.0.0.1 --port 8000 &
UVICORN_PID=$!

cleanup() {
    kill -TERM "$UVICORN_PID" 2>/dev/null || true
    wait "$UVICORN_PID" 2>/dev/null || true
}

trap cleanup TERM INT EXIT

exec nginx -g 'daemon off;'
