#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <URL_SUPABASE> <EMAIL_ADMIN> <NOM_ADMIN>" >&2
  echo "Définissez BOOTSTRAP_SECRET et ADMIN_PASSWORD dans l’environnement." >&2
  exit 2
fi
: "${BOOTSTRAP_SECRET:?BOOTSTRAP_SECRET manquant}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD manquant (12 caractères minimum)}"
curl --fail-with-body --silent --show-error \
  -X POST "$1/functions/v1/bootstrap-admin" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: ${BOOTSTRAP_SECRET}" \
  --data "$(node -e 'console.log(JSON.stringify({email:process.argv[1],password:process.env.ADMIN_PASSWORD,displayName:process.argv[2]}))' "$2" "$3")"
echo
