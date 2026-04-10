#!/usr/bin/env bash
# ==============================================================================
# GCP Infrastructure Setup — Baby Kingdom Admin
# Run once to create all GCP resources for the project.
# Usage: ./scripts/setup-gcp.sh <PROJECT_ID>
# ==============================================================================
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <PROJECT_ID>}"
REGION="asia-east1"
ZONE="${REGION}-b"
DB_INSTANCE="bk-admin-db"
DB_NAME="baby_kingdom"
DB_USER="bkadmin"
AR_REPO="bk-admin"
FRONTEND_BUCKET="${PROJECT_ID}-frontend"

echo "=== Setting project: ${PROJECT_ID} ==="
gcloud config set project "${PROJECT_ID}"

# --- Enable APIs ---
echo "=== Enabling APIs ==="
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com

# --- Artifact Registry ---
echo "=== Creating Artifact Registry ==="
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="BK Admin Docker images" \
  2>/dev/null || echo "  (already exists)"

# --- Cloud SQL (PostgreSQL 15) ---
echo "=== Creating Cloud SQL instance ==="
gcloud sql instances create "${DB_INSTANCE}" \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --storage-size=10GB \
  --storage-type=SSD \
  --backup-start-time=04:00 \
  --availability-type=zonal \
  2>/dev/null || echo "  (already exists)"

echo "=== Creating database ==="
gcloud sql databases create "${DB_NAME}" \
  --instance="${DB_INSTANCE}" \
  2>/dev/null || echo "  (already exists)"

echo "=== Creating database user ==="
DB_PASSWORD=$(openssl rand -base64 24)
gcloud sql users create "${DB_USER}" \
  --instance="${DB_INSTANCE}" \
  --password="${DB_PASSWORD}" \
  2>/dev/null || echo "  (already exists, password unchanged)"
echo "  DB Password: ${DB_PASSWORD} (save this!)"

# --- Secret Manager ---
echo "=== Creating secrets ==="
create_secret() {
  local name=$1
  local value=$2
  echo -n "${value}" | gcloud secrets create "${name}" --data-file=- 2>/dev/null \
    || echo "  ${name} already exists"
}

JWT_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)
AES_KEY=$(openssl rand -hex 16)
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

create_secret "JWT_SECRET" "${JWT_SECRET}"
create_secret "JWT_REFRESH_SECRET" "${JWT_REFRESH_SECRET}"
create_secret "AES_KEY" "${AES_KEY}"
create_secret "DATABASE_URL" "${DATABASE_URL}"
create_secret "ENCRYPTION_KEY" "${AES_KEY}"
# GEMINI_API_KEY must be set manually:
echo "  NOTE: Create GEMINI_API_KEY secret manually:"
echo "  echo -n 'your-key' | gcloud secrets create GEMINI_API_KEY --data-file=-"

# --- Service Accounts ---
echo "=== Creating Service Accounts ==="
create_sa() {
  local name=$1
  local display=$2
  gcloud iam service-accounts create "${name}" \
    --display-name="${display}" \
    2>/dev/null || echo "  ${name} already exists"
}

create_sa "bk-backend-sa" "BK Backend API"
create_sa "bk-worker-sa" "BK Worker Service"
create_sa "bk-scheduler-sa" "BK Cloud Scheduler"

BACKEND_SA="bk-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com"
WORKER_SA="bk-worker-sa@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA="bk-scheduler-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant permissions
echo "=== Granting IAM roles ==="
for SA in "${BACKEND_SA}" "${WORKER_SA}"; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA}" --role="roles/cloudsql.client" --quiet
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor" --quiet
done

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${BACKEND_SA}" --role="roles/cloudtasks.enqueuer" --quiet

# --- Cloud Tasks Queues ---
echo "=== Creating Cloud Tasks queues ==="
create_queue() {
  local name=$1
  local max_concurrent=$2
  local max_rate=${3:-"1"}
  gcloud tasks queues create "${name}" \
    --location="${REGION}" \
    --max-concurrent-dispatches="${max_concurrent}" \
    --max-dispatches-per-second="${max_rate}" \
    --max-attempts=3 \
    2>/dev/null || echo "  ${name} already exists"
}

create_queue "poster-queue" 1 "0.028"    # ~1 per 35s
create_queue "scanner-queue" 1 "1"
create_queue "trends-queue" 1 "1"
create_queue "daily-reset-queue" 1 "1"
create_queue "stats-queue" 1 "1"
create_queue "gtrends-queue" 1 "1"

# --- Cloud Storage (Frontend) ---
echo "=== Creating frontend bucket ==="
gsutil mb -l "${REGION}" "gs://${FRONTEND_BUCKET}" 2>/dev/null || echo "  (already exists)"
gsutil web set -m index.html -e index.html "gs://${FRONTEND_BUCKET}"
gsutil iam ch allUsers:objectViewer "gs://${FRONTEND_BUCKET}"

# --- Summary ---
echo ""
echo "============================================"
echo "  GCP Setup Complete!"
echo "============================================"
echo "  Project:     ${PROJECT_ID}"
echo "  Region:      ${REGION}"
echo "  Cloud SQL:   ${DB_INSTANCE} (${DB_NAME})"
echo "  DB User:     ${DB_USER}"
echo "  DB Password: ${DB_PASSWORD}"
echo "  AR Repo:     ${AR_REPO}"
echo "  Frontend:    gs://${FRONTEND_BUCKET}"
echo ""
echo "  Next steps:"
echo "  1. Set GEMINI_API_KEY secret"
echo "  2. Deploy Cloud Run services (see cloudbuild.yaml)"
echo "  3. Create Cloud Scheduler jobs (see setup-scheduler.sh)"
echo "  4. Point DNS to Cloud Run / Load Balancer"
echo "============================================"
