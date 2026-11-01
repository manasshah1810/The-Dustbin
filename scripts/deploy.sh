#!/usr/bin/env bash
# One-command deploy:  npm run deploy         (Vercel, default)
#                      npm run deploy -- netlify
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-vercel}"
[ -d node_modules ] || npm ci
npm run build
node scripts/check-size.mjs
case "$TARGET" in
  vercel)  npx --yes vercel deploy --prod --yes dist ;;
  netlify) npx --yes netlify-cli deploy --prod --dir dist ;;
  *) echo "Unknown target '$TARGET' (use vercel or netlify)"; exit 1 ;;
esac
