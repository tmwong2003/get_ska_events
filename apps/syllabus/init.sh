#!/usr/bin/env bash
# Provision resources in an existing, billing-enabled Google Cloud project.
set -euo pipefail

project=${1:?Provide a Google Cloud project ID}
runtime_id=${2:?Provide a runtime service account ID}
build_id=${3:?Provide a build service account ID}

command -v gcloud >/dev/null || {
  echo "Install gcloud before running make cloudrun-init." >&2
  exit 1
}
active_account=$(gcloud auth list --filter=status:ACTIVE --format='value(account)')
if [ -z "$active_account" ]; then
  echo "Log in with make cloudrun-login before running make cloudrun-init." >&2
  exit 1
fi
billing_enabled=$(gcloud billing projects describe "$project" --format='value(billingEnabled)')
if [ "$billing_enabled" != True ]; then
  echo "Enable billing for project $project before running make cloudrun-init." >&2
  exit 1
fi
gcloud services enable iam.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com logging.googleapis.com --project="$project" --quiet

# IAM can take a minute or more to recognize a newly created service account.
# Retry only that visibility error, preserving other failures immediately.
retry_account_visibility() {
  local delay result
  for delay in 0 2 4 8 16 32 32; do
    if [ "$delay" -gt 0 ]; then sleep "$delay"; fi
    if result=$("$@" 2>&1); then return 0; fi
    printf '%s\n' "$result" >&2
    case "$result" in
      *"Service account "*" does not exist"*) ;;
      *) return 1 ;;
    esac
  done
  return 1
}

for account_id in "$runtime_id" "$build_id"; do
  account="$account_id@$project.iam.gserviceaccount.com"
  existing_account=$(gcloud iam service-accounts list --filter="email=$account" --format='value(email)' --project="$project")
  if [ -z "$existing_account" ]; then
    gcloud iam service-accounts create "$account_id" --project="$project" --quiet
  fi
done
retry_account_visibility gcloud projects add-iam-policy-binding "$project" \
  --member="serviceAccount:$build_id@$project.iam.gserviceaccount.com" \
  --role=roles/run.builder --condition=None --quiet

existing_secrets=$(gcloud secrets list --format='value(name.basename())' --project="$project")
for secret in ska-username ska-password; do
  if ! printf '%s\n' "$existing_secrets" | grep -Fxq "$secret"; then
    gcloud secrets create "$secret" --replication-policy=automatic --project="$project" --quiet
  fi
  latest_state=$(gcloud secrets versions list "$secret" --sort-by='~createTime' --limit=1 --format='value(state)' --project="$project")
  if [ "$latest_state" != ENABLED ]; then
    # Bash read keeps values out of command history; stdin avoids CLI arguments
    # and temporary files. Disable xtrace while handling credentials.
    set +x
    value=
    IFS= read -r -s -p "Enter $secret (hidden): " value
    printf '\n' >&2
    if [ -z "$value" ]; then
      echo "$secret must not be empty." >&2
      exit 1
    fi
    printf '%s' "$value" | gcloud secrets versions add "$secret" --data-file=- --project="$project" --quiet
    unset value
  fi
  retry_account_visibility gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$runtime_id@$project.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor --condition=None --project="$project" --quiet
done

echo "Initialization complete. Run make cloudrun-deploy with the same project/account overrides."
