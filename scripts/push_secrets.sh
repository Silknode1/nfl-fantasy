#!/usr/bin/env bash
# Copies values from your local .env into this repo's GitHub Actions secrets.
# Run it yourself, once, after the repo exists:  ./scripts/push_secrets.sh
# Values travel .env -> gh (over stdin) and never pass through any chat.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo ".env not found"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI not installed"; exit 1; }

set -a
# shellcheck disable=SC1091
source .env
set +a

for name in ESPN_LEAGUE_ID ESPN_YEAR ESPN_S2 ESPN_SWID SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ODDS_API_KEY SLEEPER_USERNAME; do
  val="${!name:-}"
  if [ -z "$val" ]; then
    echo "skip  $name (empty in .env)"
    continue
  fi
  printf '%s' "$val" | gh secret set "$name"
  echo "set   $name"
done

echo "Done. Test with: gh workflow run 'NFL data refresh' && gh run watch"
