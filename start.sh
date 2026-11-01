#!/usr/bin/env bash
# مكتبة — launch the book-library server
#   phone browser:               http://127.0.0.1:8112
#   another device (same Wi-Fi): http://<phone-ip>:8112
# Binds all interfaces so both work. Override with HOST=127.0.0.1 to keep it local-only.
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-8112}"
export HOST="${HOST:-0.0.0.0}"
exec python server.py