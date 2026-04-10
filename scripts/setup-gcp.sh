#!/usr/bin/env bash
# ==============================================================================
# GCP 基础设施一键初始化 — Baby Kingdom Admin
#
# 使用现有 Cloud SQL 实例，创建数据库 + 所有 GCP 资源
# 完成后可直接运行 Cloud Build 部署
#
# Usage: ./scripts/setup-gcp.sh <PROJECT_ID> <CLOUD_SQL_INSTANCE_NAME>
#
# 示例: ./scripts/setup-gcp.sh my-project-123 my-existing-sql
# ==============================================================================
set -euo pipefail

PROJECT_ID="${1:?用法: $0 <PROJECT_ID> <CLOUD_SQL_INSTANCE_NAME>}"
DB_INSTANCE="${2:?用法: $0 <PROJECT_ID> <CLOUD_SQL_INSTANCE_NAME>}"
REGION="asia-east1"
DB_NAME="baby_kingdom"
DB_USER="bkadmin"
AR_REPO="bk-admin"
FRONTEND_BUCKET="${PROJECT_ID}-frontend"

echo ""
echo "============================================"
echo "  BK Admin — GCP 初始化"
echo "============================================"
echo "  Project:        ${PROJECT_ID}"
echo "  Region:         ${REGION}"
echo "  Cloud SQL 实例: ${DB_INSTANCE}"
echo "============================================"
echo ""

gcloud config set project "${PROJECT_ID}"

# ==============================================================================
# 1. 启用 API
# ==============================================================================
echo "=== [1/7] 启用 GCP API ==="
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com

# ==============================================================================
# 2. 创建 Artifact Registry
# ==============================================================================
echo "=== [2/7] 创建 Artifact Registry ==="
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="BK Admin Docker images" \
  2>/dev/null || echo "  (已存在，跳过)"

# ==============================================================================
# 3. 在现有 Cloud SQL 上创建数据库和用户
# ==============================================================================
echo "=== [3/7] 创建数据库和用户 (实例: ${DB_INSTANCE}) ==="

if ! gcloud sql instances describe "${DB_INSTANCE}" --format="value(name)" &>/dev/null; then
  echo "  错误: Cloud SQL 实例 '${DB_INSTANCE}' 不存在！"
  echo "  请检查实例名称，可用实例:"
  gcloud sql instances list --format="table(name, region, databaseVersion, state)"
  exit 1
fi
echo "  实例 '${DB_INSTANCE}' 已确认"

gcloud sql databases create "${DB_NAME}" \
  --instance="${DB_INSTANCE}" \
  2>/dev/null || echo "  数据库 '${DB_NAME}' 已存在"

DB_PASSWORD=$(openssl rand -base64 24)
gcloud sql users create "${DB_USER}" \
  --instance="${DB_INSTANCE}" \
  --password="${DB_PASSWORD}" \
  2>/dev/null && echo "  用户创建成功" || {
    echo "  用户 '${DB_USER}' 已存在，更新密码..."
    gcloud sql users set-password "${DB_USER}" \
      --instance="${DB_INSTANCE}" \
      --password="${DB_PASSWORD}"
  }

# ==============================================================================
# 4. 创建 Secret Manager 密钥
# ==============================================================================
echo "=== [4/7] 创建 Secret Manager 密钥 ==="

JWT_SECRET=$(openssl rand -base64 48)
ENCRYPTION_KEY=$(openssl rand -hex 16)
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

create_or_update_secret() {
  local name=$1
  local value=$2
  if gcloud secrets describe "${name}" &>/dev/null; then
    echo "  ${name}: 已存在，添加新版本"
    echo -n "${value}" | gcloud secrets versions add "${name}" --data-file=-
  else
    echo "  ${name}: 创建"
    echo -n "${value}" | gcloud secrets create "${name}" --data-file=- --replication-policy=automatic
  fi
}

create_or_update_secret "DATABASE_URL" "${DATABASE_URL}"
create_or_update_secret "JWT_SECRET" "${JWT_SECRET}"
create_or_update_secret "ENCRYPTION_KEY" "${ENCRYPTION_KEY}"

if ! gcloud secrets describe "GEMINI_API_KEY" &>/dev/null; then
  echo ""
  echo "  GEMINI_API_KEY 需要手动创建:"
  echo "  echo -n '你的密钥' | gcloud secrets create GEMINI_API_KEY --data-file=- --replication-policy=automatic"
  echo ""
else
  echo "  GEMINI_API_KEY: 已存在"
fi

# ==============================================================================
# 5. 创建 Service Account + IAM 授权
# ==============================================================================
echo "=== [5/7] 创建 Service Account + IAM 授权 ==="

create_sa() {
  local name=$1
  local display=$2
  gcloud iam service-accounts create "${name}" \
    --display-name="${display}" \
    2>/dev/null && echo "  创建: ${name}" || echo "  已存在: ${name}"
}

create_sa "bk-backend-sa" "BK Backend API"
create_sa "bk-scheduler-sa" "BK Cloud Scheduler"

BACKEND_SA="bk-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com"

grant_role() {
  local sa=$1
  local role=$2
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${sa}" --role="${role}" --quiet --no-user-output-enabled
  echo "  ${sa##*:} <- ${role##*/}"
}

# Backend SA: Cloud SQL + Secret Manager
grant_role "${BACKEND_SA}" "roles/cloudsql.client"
grant_role "${BACKEND_SA}" "roles/secretmanager.secretAccessor"

# Cloud Build SA: 部署 Cloud Run + 使用 Service Account + 管理 Storage
CLOUDBUILD_SA="${PROJECT_ID}@cloudbuild.gserviceaccount.com"
grant_role "${CLOUDBUILD_SA}" "roles/run.admin"
grant_role "${CLOUDBUILD_SA}" "roles/iam.serviceAccountUser"
grant_role "${CLOUDBUILD_SA}" "roles/storage.admin"
grant_role "${CLOUDBUILD_SA}" "roles/secretmanager.secretAccessor"

# ==============================================================================
# 6. 创建前端 Cloud Storage Bucket
# ==============================================================================
echo "=== [6/7] 创建前端 Bucket ==="

if gsutil ls -b "gs://${FRONTEND_BUCKET}" &>/dev/null; then
  echo "  已存在: gs://${FRONTEND_BUCKET}"
else
  gsutil mb -l "${REGION}" "gs://${FRONTEND_BUCKET}"
  echo "  创建: gs://${FRONTEND_BUCKET}"
fi
gsutil web set -m index.html -e index.html "gs://${FRONTEND_BUCKET}"
gsutil iam ch allUsers:objectViewer "gs://${FRONTEND_BUCKET}"

# ==============================================================================
# 7. 验证所有资源
# ==============================================================================
echo "=== [7/7] 验证资源 ==="

echo ""
check() {
  local label=$1
  local cmd=$2
  if eval "${cmd}" &>/dev/null; then
    echo "  [OK] ${label}"
  else
    echo "  [FAIL] ${label}"
  fi
}

check "Artifact Registry" "gcloud artifacts repositories describe ${AR_REPO} --location=${REGION}"
check "Cloud SQL 数据库" "gcloud sql databases describe ${DB_NAME} --instance=${DB_INSTANCE}"
check "Secret: DATABASE_URL" "gcloud secrets describe DATABASE_URL"
check "Secret: JWT_SECRET" "gcloud secrets describe JWT_SECRET"
check "Secret: ENCRYPTION_KEY" "gcloud secrets describe ENCRYPTION_KEY"
check "Secret: GEMINI_API_KEY" "gcloud secrets describe GEMINI_API_KEY"
check "SA: bk-backend-sa" "gcloud iam service-accounts describe ${BACKEND_SA}"
check "Frontend Bucket" "gsutil ls -b gs://${FRONTEND_BUCKET}"

# ==============================================================================
# 完成
# ==============================================================================
CLOUD_SQL_CONNECTION="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

echo ""
echo "============================================"
echo "  GCP 初始化完成！"
echo "============================================"
echo ""
echo "  数据库密码: ${DB_PASSWORD}"
echo "  (已存入 Secret Manager，此处仅供记录)"
echo ""
echo "  下一步 — 一键部署:"
echo ""
echo "  gcloud builds submit \\"
echo "    --config=cloudbuild.yaml \\"
echo "    --substitutions=_CLOUD_SQL_INSTANCE=${CLOUD_SQL_CONNECTION}"
echo ""
echo "  部署完成后 — 创建定时任务:"
echo ""
echo "  BACKEND_URL=\$(gcloud run services describe bk-backend --region=${REGION} --format='value(status.url)')"
echo "  ./scripts/setup-scheduler.sh ${PROJECT_ID} \$BACKEND_URL"
echo ""
echo "============================================"
