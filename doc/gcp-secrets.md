# GCP Secret Manager — Baby Kingdom

Project: `sugar-379907`

## Secrets Used

| Secret | Env Var | Purpose |
|--------|---------|---------|
| `BK_DATABASE_URL` | `DATABASE_URL` | PostgreSQL 连接串 (Cloud SQL) |
| `BK_JWT_SECRET` | `JWT_SECRET` | JWT 签发/验证密钥 |
| `BK_ENCRYPTION_KEY` | `ENCRYPTION_KEY` | AES-256 加密 isSecret 配置项 |

> `GEMINI_API_KEY` 存在数据库 `configs` 表中（通过 Config 页面管理），不使用 Secret Manager。

## Local Development

本地开发需要从 Secret Manager 拉取以下值到 `backend/.env`：

```bash
# 查看值
gcloud secrets versions access latest --secret=BK_DATABASE_URL
gcloud secrets versions access latest --secret=BK_JWT_SECRET
gcloud secrets versions access latest --secret=BK_ENCRYPTION_KEY
```

本地 `backend/.env` 对应字段：
- `DATABASE_URL` — 本地通过 Cloud SQL Proxy 连接，格式: `postgresql://bkadmin:PASSWORD@localhost:5433/baby_kingdom`
- `JWT_SECRET` — 需与远端一致，否则本地生成的 token 远端无法验证
- `ENCRYPTION_KEY` — **必须与远端一致**，否则无法解密 isSecret 配置（如 MediaLens Token）

## Cloud Run Binding

Secrets 通过 Cloud Run 环境变量绑定（Secret 名 → 环境变量名）：

```bash
gcloud run services update babykingdom-backend --region=us-central1 \
  --update-secrets=DATABASE_URL=BK_DATABASE_URL:latest,JWT_SECRET=BK_JWT_SECRET:latest,ENCRYPTION_KEY=BK_ENCRYPTION_KEY:latest
```

## Update a Secret

```bash
echo -n "new-value" | gcloud secrets versions add BK_SECRET_NAME --data-file=-
# 然后重新部署或重启 Cloud Run 实例
gcloud run services update babykingdom-backend --region=us-central1 \
  --update-secrets=ENV_VAR=BK_SECRET_NAME:latest
```
