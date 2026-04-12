#!/usr/bin/env bash
# ==============================================================================
# Cloud Scheduler Setup — Baby Kingdom Admin
# Creates 3 cron jobs that trigger the Backend HTTP service.
# Run after deploying babykingdom-backend to Cloud Run.
# Usage: ./scripts/setup-scheduler.sh <PROJECT_ID> <BACKEND_URL>
# ==============================================================================
set -euo pipefail

PROJECT_ID="${1:?用法: $0 <PROJECT_ID> <BACKEND_URL>}"
BACKEND_URL="${2:?用法: $0 <PROJECT_ID> <BACKEND_URL>}"
REGION="asia-east1"
SCHEDULER_SA="babykingdom-scheduler-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Setting project: ${PROJECT_ID} ==="
gcloud config set project "${PROJECT_ID}"

# Grant scheduler SA permission to invoke backend Cloud Run
echo "=== Granting invoker role to scheduler SA ==="
gcloud run services add-iam-policy-binding babykingdom-backend \
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
    --uri="${BACKEND_URL}${endpoint}" \
    --http-method="${method}" \
    --body="${body}" \
    --oidc-service-account-email="${SCHEDULER_SA}" \
    --time-zone="Asia/Hong_Kong" \
    2>/dev/null || echo "  ${name} already exists"
}

# Scanner: every 5 minutes
create_job "scanner-cron" "*/5 * * * *" "/tasks/scanner"

# Trends (MediaLens): every 60 minutes
create_job "trends-cron" "0 * * * *" "/tasks/trends"

# Google Trends: every 30 minutes
create_job "gtrends-cron" "*/30 * * * *" "/tasks/gtrends"

echo ""
echo "=== Cloud Scheduler setup complete ==="
echo "  3 jobs created targeting: ${BACKEND_URL}"
echo ""
echo "  已砍掉的 job（由 Backend 进程内 cron 替代）:"
echo "  - daily-reset-cron → server.ts node-cron (0:00 HKT)"
echo "  - stats-cron → server.ts node-cron (:05)"
echo "  - health-cron → server.ts node-cron (5m)"
