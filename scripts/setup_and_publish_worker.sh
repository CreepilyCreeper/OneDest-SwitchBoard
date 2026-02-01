#!/usr/bin/env bash
# Create wrangler.toml and publish Cloudflare Worker for OneDest SwitchBoard
# Usage: bash scripts/setup_and_publish_worker.sh
# This script will:
#  - create a basic wrangler.toml at project root (if not present)
#  - prompt for Cloudflare account_id, GitHub OAuth client id/secret
#  - create Worker secrets via `wrangler secret put`
#  - publish the worker with `wrangler publish`
#
# Requirements:
#  - wrangler installed and logged in: npm install -g @cloudflare/wrangler ; wrangler login
#  - run from project root
#
# NOTE: This writes wrangler.toml; review before publishing.

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WRANGLER_TOML="$ROOT_DIR/wrangler.toml"

echo "== OneDest SwitchBoard Worker setup =="
read -p "Cloudflare account_id: " ACCOUNT_ID
read -p "Worker name (default: onedest-switchboard-auth): " WORKER_NAME
WORKER_NAME=${WORKER_NAME:-onedest-switchboard-auth}

# Defaults
MAIN="src/worker/create_pr_worker.ts"
COMPAT_DATE=$(date -I) # YYYY-MM-DD

if [ -f "$WRANGLER_TOML" ]; then
  echo "wrangler.toml already exists at $WRANGLER_TOML"
  read -p "Overwrite? (y/N) " OVERWRITE
  if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
    echo "Skipping wrangler.toml generation."
  else
    rm -f "$WRANGLER_TOML"
  fi
fi

if [ ! -f "$WRANGLER_TOML" ]; then
  cat > "$WRANGLER_TOML" <<EOF
name = "${WORKER_NAME}"
main = "${MAIN}"
compatibility_date = "${COMPAT_DATE}"
workers_dev = true
account_id = "${ACCOUNT_ID}"
EOF
  echo "Created $WRANGLER_TOML"
fi

echo
echo "Ensure you are logged in to wrangler. If not, run: wrangler login"
if ! command -v wrangler >/dev/null 2>&1; then
  echo "ERROR: wrangler not found in PATH. Install with 'npm install -g @cloudflare/wrangler' and run 'wrangler login'."
  exit 1
fi

echo
read -p "Now enter GitHub OAuth Client ID (this will be stored as a Worker secret GITHUB_CLIENT_ID): " GITHUB_CLIENT_ID
read -p "Now enter GitHub OAuth Client Secret (will be stored as GITHUB_CLIENT_SECRET): " GITHUB_CLIENT_SECRET

echo "Storing secrets into Cloudflare Worker (wrangler will prompt if necessary)..."
# Use wrangler secret put — the command reads from stdin, so echo the value and pipe it
echo "$GITHUB_CLIENT_ID" | wrangler secret put GITHUB_CLIENT_ID || { echo "Failed to set GITHUB_CLIENT_ID"; exit 1; }
echo "$GITHUB_CLIENT_SECRET" | wrangler secret put GITHUB_CLIENT_SECRET || { echo "Failed to set GITHUB_CLIENT_SECRET"; exit 1; }

echo "Publishing worker..."
wrangler publish || { echo "wrangler publish failed"; exit 1; }

echo "Done. Worker published. If workers_dev is true, your worker will be available at:"
echo "https://${WORKER_NAME}.${ACCOUNT_ID}.workers.dev (verify from wrangler output or Cloudflare dashboard)"
echo
echo "Next steps:"
echo " - Verify that your GitHub OAuth App's callback URL is set to: https://<your-site>/oauth-callback"
echo " - Configure client env: NEXT_PUBLIC_GITHUB_CLIENT_ID, NEXT_PUBLIC_CF_WORKER_URL, NEXT_PUBLIC_OAUTH_REDIRECT"
echo