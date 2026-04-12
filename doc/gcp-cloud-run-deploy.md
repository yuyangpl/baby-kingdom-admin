# GCP Cloud Run 部署指南

> 日期: 2026-04-11
> 分支: GCP-cloud-run

---

## 架构总览

```
用户浏览器
    |
    v
Cloud Run: babykingdom-frontend (Nginx)        <-- Vue SPA + 反向代理
    |
    |-- 静态文件 --> 直接返回 HTML/JS/CSS
    |-- /api/*   --> 反代到 babykingdom-backend
    |-- /tasks/* --> 反代到 babykingdom-backend
                        |
                        v
              Cloud Run: babykingdom-backend (Node.js)
                        |
                        |-- 65+ API 端点 (/api/v1/*)
                        |-- 4 个 task 端点 (/tasks/*)
                        |-- 3 个内置 cron (node-cron)
                        |-- Cloud SQL (PostgreSQL)

Cloud Scheduler (3 jobs) --> babykingdom-backend /tasks/*
```

- 用户只需访问 babykingdom-frontend 的 URL，一个入口搞定一切，无 CORS 问题
- 无独立 Worker 服务 -- task 端点合并在 Backend 中

## Cloud Run 服务

| 服务 | 镜像 | 内存 | 端口 | 费用 |
|------|------|------|------|------|
| babykingdom-backend | Node.js Express | 512Mi | 3000 | ~$3-5/月 |
| babykingdom-frontend | Nginx + Vue SPA | 256Mi | 8080 | ~$0-1/月 |

## 定时任务

### Cloud Scheduler (外部，3 个)

| Job | 频率 | 端点 |
|-----|------|------|
| scanner-cron | 每5分钟 | `/tasks/scanner` |
| trends-cron | 每小时 | `/tasks/trends` |
| gtrends-cron | 每30分钟 | `/tasks/gtrends` |

### 进程内 node-cron (内置，3 个)

| Job | 频率 | 说明 |
|-----|------|------|
| daily-reset | 每天 0:00 HKT | 重置 Persona 发帖计数 + 清理过期 token/日志 |
| stats-aggregator | 每小时 :05 | 聚合每日统计 |
| health-monitor | 每5分钟 | 健康检查 + 告警 |

## 数据初始化

Backend 启动时自动执行全部 seed（幂等，重复启动安全）：

```
server.ts 启动流程:
  1. connectDB()        -- 连接 PostgreSQL
  2. seedAdmin()        -- 创建 admin 用户
  3. seedConfigs()      -- 46 项系统配置
  4. seedData()         -- 30 Personas + 5 Tones + 12 Rules + 34 Boards
  5. initQueues()       -- 初始化队列
  6. cron.schedule()    -- 注册定时任务
  7. app.listen()       -- 启动 HTTP 服务
```

部署完成后无需手动导入数据。

---

## 部署流程（3 步）

### 前提条件

- 已有 GCP 项目
- 已有 Cloud SQL (PostgreSQL) 实例
- 本地已安装 gcloud CLI 并登录

### 第 1 步：初始化 GCP 资源（一次性）

```bash
./scripts/setup-gcp.sh <PROJECT_ID> <Cloud_SQL实例名>
```

自动完成 6 项：

| # | 内容 |
|---|------|
| 1 | 启用 API (Cloud Run, Cloud SQL, Cloud Build, Artifact Registry, Cloud Scheduler, Secret Manager) |
| 2 | 创建 Artifact Registry 镜像仓库 (babykingdom) |
| 3 | 在已有 Cloud SQL 上创建数据库 (baby_kingdom) + 用户 (bkadmin) |
| 4 | 创建 Secret Manager 密钥 (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY) |
| 5 | 创建 Service Account (babykingdom-backend-sa, bk-scheduler-sa) + IAM 授权 |
| 6 | 验证所有资源 |

脚本结束时会输出数据库密码和后续命令，请记录。

GEMINI_API_KEY 需要手动创建：
```bash
echo -n '你的Gemini密钥' | gcloud secrets create GEMINI_API_KEY --data-file=- --replication-policy=automatic
```

### 第 2 步：构建 + 部署（每次代码更新）

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_CLOUD_SQL_INSTANCE=<PROJECT_ID>:asia-east1:<实例名>
```

Cloud Build 自动完成：

| # | 步骤 | 说明 |
|---|------|------|
| 1 | build-backend | 构建 Backend Docker 镜像 |
| 2 | build-frontend | 构建 Frontend Docker 镜像 (Nginx + Vue SPA) |
| 3 | push | 推送镜像到 Artifact Registry |
| 4 | db-migrate | 运行 Prisma 数据库迁移 |
| 5 | deploy-backend | 部署 babykingdom-backend 到 Cloud Run |
| 6 | deploy-frontend | 部署 babykingdom-frontend 到 Cloud Run（自动注入 BACKEND_URL） |
| 7 | print-urls | 输出 Backend + Frontend URL |

Backend 和 Frontend 构建并行执行，Frontend 部署会自动获取 Backend URL 并注入为环境变量。

### 第 3 步：创建定时任务（一次性）

```bash
BACKEND_URL=$(gcloud run services describe babykingdom-backend --region=asia-east1 --format='value(status.url)')
./scripts/setup-scheduler.sh <PROJECT_ID> $BACKEND_URL
```

创建 3 个 Cloud Scheduler jobs，通过 OIDC 认证调用 Backend `/tasks/*` 端点。

---

## 关键文件

| 文件 | 用途 |
|------|------|
| `cloudbuild.yaml` | Cloud Build CI/CD 配置 |
| `scripts/setup-gcp.sh` | GCP 基础设施初始化脚本 |
| `scripts/setup-scheduler.sh` | Cloud Scheduler 定时任务脚本 |
| `backend/Dockerfile` | Backend Docker 镜像 |
| `frontend/Dockerfile` | Frontend Docker 镜像 (Nginx) |
| `frontend/nginx.conf.template` | Nginx 配置模板 (envsubst 注入 BACKEND_URL) |
| `frontend/nginx.conf` | 本地 docker-compose 用的 Nginx 配置 |

## 费用预估

| 场景 | 月费 |
|------|------|
| 闲置 (Cloud Run 缩至 0) | ~$10 (Cloud SQL) |
| 低流量 (1-2 管理员) | ~$15-18 |
| 正常使用 (3-5 管理员) | ~$22-28 |

Cloud SQL 是唯一固定成本 (~$8-10)，Cloud Run 按请求计费，闲时趋零。

## 本地开发

本地开发仍使用 docker-compose（MongoDB + Redis）：

```bash
# Backend
cd backend && cp ../.env.development .env && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## pgAdmin 连接 Cloud SQL

```bash
# 1. 启动代理
cloud-sql-proxy <PROJECT_ID>:asia-east1:<实例名> --port=5432

# 2. pgAdmin 连接参数
#    Host: localhost
#    Port: 5432
#    Database: baby_kingdom
#    User: bkadmin
#    Password: setup-gcp.sh 输出的密码
```
