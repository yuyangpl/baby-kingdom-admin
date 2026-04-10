# GCP 服务介绍

本文档介绍项目部署可能用到的 GCP 服务及其作用。

---

## 1. Cloud Run

**一句话：** 全托管的无服务器容器运行平台。

**是什么：**
Cloud Run 可以直接运行 Docker 容器，无需管理服务器、集群或基础设施。你只需提供一个容器镜像，Cloud Run 自动处理扩缩容、负载均衡、HTTPS 证书等。

**核心特性：**
- 按请求计费 — 没有流量时缩容到 0，不产生费用
- 自动扩缩容 — 根据并发请求数自动增减实例（0 到 N）
- 支持自定义域名和 HTTPS
- 每个服务可独立配置 CPU、内存、最大实例数、并发数
- 支持 WebSocket（需配置 session affinity）
- 支持 always-on 模式（最少保留 1 个实例，避免冷启动）

**适用场景：**
- Web API 服务（如 Express backend）
- 前端静态站点（Nginx 容器）
- Worker 服务（长期运行的后台任务处理）

**与本项目的关系：**
可部署 3 个 Cloud Run 服务：
| 服务 | 容器 | 说明 |
|------|------|------|
| `bk-backend` | backend Dockerfile | Express API + Socket.io |
| `bk-worker` | backend Dockerfile (command: worker.js) | BullMQ 队列处理 + 定时任务 |
| `bk-frontend` | frontend Dockerfile | Nginx 托管 Vue SPA |

---

## 2. Cloud Build (CI/CD)

**一句话：** GCP 原生的持续集成/持续部署服务。

**是什么：**
Cloud Build 可以在代码推送到 Git 仓库时自动触发构建流程：拉取代码 → 运行测试 → 构建 Docker 镜像 → 推送到 Artifact Registry → 部署到 Cloud Run。整个流程通过 `cloudbuild.yaml` 配置文件定义。

**核心特性：**
- 与 GitHub / GitLab / Bitbucket / Cloud Source Repositories 集成
- 支持触发器（push to branch、tag、PR）
- 每步是一个容器，可串行或并行执行
- 自动构建 Docker 镜像并推送到 Artifact Registry
- 可直接调用 `gcloud run deploy` 完成部署
- 每天 120 分钟免费构建额度

**典型流程：**
```
git push main
  → Cloud Build 触发
    → Step 1: npm test (运行测试)
    → Step 2: docker build (构建镜像)
    → Step 3: docker push (推送到 Artifact Registry)
    → Step 4: gcloud run deploy (部署到 Cloud Run)
```

**配置文件示例 (cloudbuild.yaml)：**
```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'asia-east1-docker.pkg.dev/$PROJECT_ID/bk/backend', './backend']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'asia-east1-docker.pkg.dev/$PROJECT_ID/bk/backend']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['gcloud', 'run', 'deploy', 'bk-backend', '--image', 'asia-east1-docker.pkg.dev/$PROJECT_ID/bk/backend', '--region', 'asia-east1']
```

**与本项目的关系：**
代码推送到 main 分支后，自动构建 backend / frontend / worker 三个镜像并部署到 Cloud Run，实现零手动操作的 CI/CD。

---

## 3. Cloud Scheduler

**一句话：** 全托管的定时任务调度器（云端 cron）。

**是什么：**
Cloud Scheduler 可以按 cron 表达式定时触发 HTTP 请求、Pub/Sub 消息或 Cloud Tasks。相当于一个可靠的云端 crontab，不需要自己维护服务器来跑定时任务。

**核心特性：**
- 支持标准 cron 表达式（`*/5 * * * *`）
- 支持指定时区（如 `Asia/Hong_Kong`）
- 触发目标：HTTP endpoint / Pub/Sub / Cloud Tasks
- 自动重试（可配置重试次数和间隔）
- 每个项目 3 个免费 job

**与本项目的关系：**
替代 Worker 中的 node-cron 定时调度，更可靠且不依赖 Worker 实例存活：

| 定时任务 | Cron 表达式 | 触发目标 |
|---------|------------|---------|
| Scanner 扫描检查 | `*/5 * * * *` | POST /api/v1/scanner/trigger |
| Trends 拉取 | `0 * * * *` | POST /api/v1/trends/trigger |
| Google Trends 拉取 | `*/30 * * * *` | POST /api/v1/google-trends/trigger |
| 每日重置 | `0 0 * * *` (HKT) | POST /api/v1/queues/daily-reset/trigger |
| 统计聚合 | `5 * * * *` | POST /api/v1/dashboard/aggregate |
| 健康检查 | `*/5 * * * *` | GET /api/health |

---

## 4. Cloud Tasks

**一句话：** 全托管的异步任务队列服务。

**是什么：**
Cloud Tasks 可以将任务放入队列，异步地发送 HTTP 请求到目标服务。支持速率限制、重试策略、延迟执行等。可以看作是一个云端的消息队列 + HTTP dispatcher。

**核心特性：**
- 任务持久化 — 入队后保证至少执行一次（at-least-once delivery）
- 速率限制 — 控制每秒最大分发数（适合论坛发帖限频）
- 延迟执行 — 指定任务在未来某个时间点执行
- 自动重试 — 失败后按指数退避重试
- 任务去重 — 相同 task ID 在一定时间窗口内不重复执行

**与本项目的关系：**
可替代 BullMQ + Redis 作为任务队列：

| BullMQ 队列 | Cloud Tasks 队列 | 说明 |
|-------------|-----------------|------|
| `scanner` | `bk-scanner` | 版块扫描任务 |
| `trends` | `bk-trends` | Trends 拉取任务 |
| `poster` | `bk-poster` | 发帖任务（rate limit: 1/35s） |
| `daily-reset` | `bk-daily-reset` | 每日重置 |
| `stats-aggregator` | `bk-stats` | 统计聚合 |
| `google-trends` | `bk-gtrends` | Google Trends 拉取 |

**优势：** 不需要自己维护 Redis 实例，队列完全托管。
**劣势：** 没有 BullMQ 的 job dashboard / 进度跟踪 / 优先级等高级功能。

---

## 5. Cloud SQL

**一句话：** 全托管的关系型数据库服务（MySQL / PostgreSQL / SQL Server）。

**是什么：**
Cloud SQL 提供全托管的数据库实例，GCP 自动处理备份、复制、故障切换、补丁更新等运维工作。支持通过 Cloud SQL Auth Proxy 安全连接，无需暴露公网 IP。

**核心特性：**
- 支持 MySQL 8、PostgreSQL 15、SQL Server 2022
- 自动备份（每日）+ 时间点恢复（PITR）
- 高可用（跨区域副本 + 自动故障切换）
- 通过 Cloud SQL Auth Proxy 或 VPC 私有 IP 连接
- 与 Cloud Run 原生集成（通过 Unix socket 连接）
- 可纵向扩展（CPU/RAM/磁盘）

**与本项目的关系：**
本项目当前使用 MongoDB。Cloud SQL 提供的是关系型数据库，如果要使用需要做数据层迁移（Mongoose → Sequelize/Prisma）。

> **注意：** GCP 也提供 MongoDB 兼容方案：
> - **MongoDB Atlas on GCP** — MongoDB 官方托管，部署在 GCP 基础设施上
> - **Firestore (Native mode)** — GCP 原生 NoSQL，文档模型类似但 API 不同
>
> 如果不想迁移数据库引擎，推荐使用 MongoDB Atlas 而非 Cloud SQL。

---

## 服务对比总结

| 本地/Docker | GCP 对应服务 | 是否需要改代码 |
|------------|-------------|--------------|
| Express API (backend) | Cloud Run | 否 — 直接用现有 Dockerfile |
| Vue SPA (frontend) | Cloud Run | 否 — 直接用现有 Dockerfile |
| Worker (BullMQ processors) | Cloud Run | 否 — 直接用现有 Dockerfile |
| node-cron (定时调度) | Cloud Scheduler | 小改 — 添加 HTTP trigger 端点 |
| BullMQ + Redis (任务队列) | Cloud Tasks + (可选保留 Redis) | 中等 — 替换队列入队/消费逻辑 |
| MongoDB | MongoDB Atlas on GCP | 否 — 只改连接字符串 |
| Redis | Memorystore for Redis | 否 — 只改连接地址 |

**最小改动部署方案：** Cloud Run + MongoDB Atlas + Memorystore for Redis + Cloud Build，保留 BullMQ 架构不变，仅用 Cloud Scheduler 替代 node-cron。
