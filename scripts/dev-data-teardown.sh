#!/usr/bin/env bash
set -euo pipefail

# Deletes the Neon branch created by dev-data-setup.sh and removes .env.local.
#
# Usage: ./scripts/dev-data-teardown.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

# Load .env.secrets if present
if [[ -f "$REPO_ROOT/.env.secrets" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$REPO_ROOT/.env.secrets"; set +a
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env.local found — nothing to tear down." >&2
  exit 0
fi

# shellcheck disable=SC1091
set -a; source "$ENV_FILE"; set +a

if [[ -z "${NEON_BRANCH_ID:-}" ]]; then
  echo "Error: NEON_BRANCH_ID not found in .env.local — delete manually." >&2
  exit 1
fi
if [[ -z "${NEON_API_KEY:-}" ]]; then
  echo "Error: NEON_API_KEY is not set. Add it to .env.secrets or export it." >&2
  exit 1
fi
if [[ -z "${NEON_PROJECT_ID:-}" ]]; then
  echo "Error: NEON_PROJECT_ID is not set. Add it to .env.secrets or export it." >&2
  exit 1
fi

echo "Deleting Neon branch: ${NEON_BRANCH_ID}"

curl -sf -X DELETE \
  "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${NEON_BRANCH_ID}" \
  -H "Authorization: Bearer ${NEON_API_KEY}" > /dev/null

rm "$ENV_FILE"
rm -f "$REPO_ROOT/.env"
echo "Done. Branch deleted, .env.local and .env removed."
