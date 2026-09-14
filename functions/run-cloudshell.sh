#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-auth-canary-test}"

echo "Using Firebase project: ${PROJECT_ID}"
TOKEN="$(gcloud auth print-access-token)"

APP_ID="$(curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps" \
  | jq -r '.apps[0].appId // empty')"

if [[ -z "${APP_ID}" ]]; then
  echo "ERROR: No Firebase Web App found in ${PROJECT_ID}." >&2
  exit 1
fi

API_KEY="$(curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps/${APP_ID}/config" \
  | jq -r '.apiKey // empty')"

if [[ -z "${API_KEY}" ]]; then
  echo "ERROR: Could not read the Firebase Web API key." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

WEB_API_KEY="${API_KEY}" node local-run.js
