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
REGION="us-central1"
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
create_job "babykingdom-scanner-cron" "*/5 * * * *" "/tasks/scanner"

# Trends (MediaLens): every 60 minutes
create_job "babykingdom-trends-cron" "0 * * * *" "/tasks/trends"

# Google Trends: every 30 minutes
create_job "babykingdom-gtrends-cron" "*/30 * * * *" "/tasks/gtrends"

# Poster: every 2 minutes (checks for approved feeds to post)
# Created but PAUSED by default — enable when ready for auto-posting
create_job "babykingdom-poster-cron" "*/2 * * * *" "/tasks/poster"
echo "  Pausing babykingdom-poster-cron (enable manually when ready)..."
gcloud scheduler jobs pause "babykingdom-poster-cron" --location="${REGION}" --quiet 2>/dev/null || true

# Pause all jobs by default — enable manually when ready
echo ""
echo "=== Pausing all jobs (enable manually when ready) ==="
for JOB in babykingdom-scanner-cron babykingdom-trends-cron babykingdom-gtrends-cron; do
  gcloud scheduler jobs pause "${JOB}" --location="${REGION}" --quiet 2>/dev/null || true
  echo "  Paused: ${JOB}"
done

echo ""
echo "=== Cloud Scheduler setup complete ==="
echo "  4 jobs created targeting: ${BACKEND_URL}"
echo "  All jobs are PAUSED. Enable with:"
echo "    gcloud scheduler jobs resume <job-name> --location=${REGION}"
echo ""
echo "  进程内 cron（Backend 启动时自动运行）:"
echo "  - daily-reset → server.ts node-cron (0:00 HKT)"
echo "  - stats-aggregator → server.ts node-cron (:05)"
echo "  - health-monitor → server.ts node-cron (5m)"
