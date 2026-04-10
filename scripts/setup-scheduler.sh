#!/usr/bin/env bash
# ==============================================================================
# Cloud Scheduler Setup — Baby Kingdom Admin
# Creates 6 cron jobs that trigger the Worker HTTP service.
# Run after deploying bk-worker to Cloud Run.
# Usage: ./scripts/setup-scheduler.sh <PROJECT_ID> <WORKER_URL>
# ==============================================================================
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <PROJECT_ID> <WORKER_URL>}"
WORKER_URL="${2:?Usage: $0 <PROJECT_ID> <WORKER_URL>}"
REGION="asia-east1"
SCHEDULER_SA="bk-scheduler-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Setting project: ${PROJECT_ID} ==="
gcloud config set project "${PROJECT_ID}"

# Grant scheduler SA permission to invoke worker Cloud Run
echo "=== Granting invoker role to scheduler SA ==="
gcloud run services add-iam-policy-binding bk-worker \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker" \
  --region="${REGION}" \
  --quiet

# --- Create Scheduler Jobs ---
echo "=== Creating Cloud Scheduler jobs ==="

create_job() {
  local name=$1
  local schedule=$2
  local endpoint=$3
  local method=${4:-POST}
  local body=${5:-'{"triggeredBy":"cron"}'}

  gcloud scheduler jobs create http "${name}" \
    --location="${REGION}" \
    --schedule="${schedule}" \
    --uri="${WORKER_URL}${endpoint}" \
    --http-method="${method}" \
    --body="${body}" \
    --oidc-service-account-email="${SCHEDULER_SA}" \
    --time-zone="Asia/Hong_Kong" \
    2>/dev/null || echo "  ${name} already exists"
}

# Scanner: every 5 minutes (checks which boards are due)
create_job "scanner-cron" "*/5 * * * *" "/tasks/scanner"

# Trends (MediaLens): every 60 minutes
create_job "trends-cron" "0 * * * *" "/tasks/trends"

# Daily Reset: midnight HKT
create_job "daily-reset-cron" "0 0 * * *" "/tasks/daily-reset"

# Stats Aggregator: every hour at :05
create_job "stats-cron" "5 * * * *" "/tasks/stats"

# Google Trends: every 30 minutes
create_job "gtrends-cron" "*/30 * * * *" "/tasks/gtrends"

# Health Check: every 5 minutes
create_job "health-cron" "*/5 * * * *" "/health" "GET" ""

echo ""
echo "=== Cloud Scheduler setup complete ==="
echo "  6 jobs created targeting: ${WORKER_URL}"
