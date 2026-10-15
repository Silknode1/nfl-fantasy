#!/usr/bin/env bash
# Fantasy Terminal: refresh league data, then open the app at http://localhost:5173
#   ./fantasy.sh            pull fresh ESPN + Supabase data, then start the app
#   ./fantasy.sh --offline  skip the pulls and reuse cached data
set -euo pipefail
cd "$(dirname "$0")"
python3 -B -m fantasy.build "$@"
cd web
[ -d node_modules ] || npm install
exec npm run dev -- --open
