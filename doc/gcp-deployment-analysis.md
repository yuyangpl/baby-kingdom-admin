# GCP 部署方案分析 — Baby Kingdom Admin

> 日期: 2026-04-09
> 项目: BK 论坛自动化运营后台 (Vue 3 + Express + MongoDB + BullMQ + Socket.io)

---

## 目录

1. [项目架构现状](#1-项目架构现状)
2. [Server 部署方案对比](#2-server-部署方案对比)
3. [Cron Job 方案分析](#3-cron-job-方案分析)
4. [Queue 方案对比](#4-queue-方案对比)
5. [Database 方案对比](#5-database-方案对比)
6. [专家讨论](#6-专家讨论)
7. [最终推荐方案](#7-最终推荐方案)
8. [成本估算](#8-成本估算)
9. [迁移路径](#9-迁移路径)
10. [方案 A vs 方案 B 综合对比](#10-方案-a-vs-方案-b-综合对比)
11. [GCP Docker 部署支持](#11-gcp-docker-部署支持)
12. [部署实施方案](#12-部署实施方案)
13. [方案修订: 去 WebSocket + GCP 全托管队列](#13-方案修订-去-websocket--gcp-全托管队列)

---

## 1. 项目架构现状

### 核心组件


| 组件              | 技术                  | 特点                                      |
| --------------- | ------------------- | --------------------------------------- |
| **Backend API** | Express + Socket.io | 65+ REST endpoints, WebSocket 实时推送      |
| **Worker**      | BullMQ (6 queues)   | 后台任务处理, Redis leader election           |
| **Frontend**    | Vue 3 SPA (Vite)    | 13 页面, 静态资源                             |
| **Database**    | MongoDB 7           | 12+ collections, TTL index              |
| **Cache/Queue** | Redis 7             | BullMQ backend, Socket.io adapter, 分布式锁 |


### 关键约束

- **Poster 串行限制**: 1 job/35s, concurrency:1, 不可并行
- **WebSocket**: Socket.io 需要 Redis adapter 做多实例广播
- **Leader Election**: Redis 分布式锁, 60s TTL, 保证 cron 单实例执行
- **External API**: BK Forum (35s 限频), Gemini AI, MediaLens
- **预计并发**: 1-5 管理员, 10-50 WebSocket 连接

---

## 2. Server 部署方案对比

### 方案 A: Cloud Run


| 维度            | 评分    | 说明                                    |
| ------------- | ----- | ------------------------------------- |
| **部署复杂度**     | ⭐⭐⭐⭐⭐ | Container 直接部署, 与 Docker Compose 天然兼容 |
| **自动扩缩**      | ⭐⭐⭐⭐⭐ | 0→N 自动缩放, 按请求计费                       |
| **成本**        | ⭐⭐⭐⭐  | 低流量时极便宜 (可缩至 0)                       |
| **WebSocket** | ⭐⭐⭐   | 支持, 但有限制 (最长 3600s 连接, 冷启动断连)         |
| **长时间任务**     | ⭐⭐    | 默认超时 5min, 最长 60min; Worker 需特殊处理     |
| **运维**        | ⭐⭐⭐⭐⭐ | 全托管, 无需管理服务器                          |


**Cloud Run 关键限制:**

1. **冷启动**: 缩至 0 时首次请求延迟 2-5s
2. **WebSocket 连接时长**: 最长 3600s, 之后断开需重连
3. **Worker 挑战**: BullMQ Worker 需要持续运行, Cloud Run 按请求计费模型不太匹配
4. **最小实例**: 设 `min-instances=1` 可解冷启动, 但失去缩至 0 优势

**Cloud Run 适配方案:**

```
Backend API  → Cloud Run (min-instances=1, WebSocket 启用)
Worker       → Cloud Run (always-on, min-instances=1, 无 HTTP 入口)
                或 Cloud Run Jobs (定时触发)
Frontend     → Cloud Run (静态 Nginx) 或 Cloud Storage + CDN
```

### 方案 B: Compute Engine VM


| 维度            | 评分    | 说明                                   |
| ------------- | ----- | ------------------------------------ |
| **部署复杂度**     | ⭐⭐⭐   | 需要手动配置, 但 docker-compose 可直接运行       |
| **自动扩缩**      | ⭐⭐    | 需 MIG (Managed Instance Group), 配置复杂 |
| **成本**        | ⭐⭐⭐   | 固定月费, 低流量时偏贵, 高流量时可预测                |
| **WebSocket** | ⭐⭐⭐⭐⭐ | 完全支持, 无限制                            |
| **长时间任务**     | ⭐⭐⭐⭐⭐ | Worker 可 24/7 运行, 无超时限制              |
| **运维**        | ⭐⭐    | 需自行管理 OS 更新、安全补丁、监控                  |


**VM 适配方案:**

```
单 VM 方案 (e2-small / e2-medium):
  └── docker-compose up (完整栈)
      ├── backend (API + Socket.io)
      ├── worker (BullMQ)
      ├── frontend (Nginx)
      ├── MongoDB
      └── Redis
```

### 对比总结


| 考量点          | Cloud Run        | VM                     |
| ------------ | ---------------- | ---------------------- |
| 项目规模匹配度      | 中 (Worker 需额外处理) | 高 (docker-compose 直接跑) |
| 初期成本 (月)     | ~$5-15           | ~$15-30 (e2-small)     |
| 运维负担         | 低                | 中-高                    |
| 扩展性          | 高                | 需手动                    |
| WebSocket 支持 | 有限制              | 完美                     |
| Worker 适配性   | 差 (需改造)          | 好 (原生运行)               |


---

## 3. Cron Job 方案分析

### 现状

项目已实现完整的内部 Cron 系统:

- BullMQ `repeatableJobs` 管理 6 个定时任务
- Redis 分布式锁实现 Leader Election
- 任务粒度: 5min (健康检查) ~ 24h (每日重置)

### 方案: Cloud Scheduler


| 优势              | 劣势                           |
| --------------- | ---------------------------- |
| GCP 原生, 可观测性好   | 需改造: 每个 cron → HTTP endpoint |
| 自动重试, 精确调度      | 丢失 BullMQ 内建的去重、重试、超时        |
| 与 Cloud Run 配合好 | 需额外开发 6 个 trigger endpoint   |
| $0.10/job/月     | Leader Election 机制变得冗余       |


### 分析结论

**不推荐替换为 Cloud Scheduler**, 原因:

1. **已有成熟实现**: BullMQ repeatable jobs + Redis leader election 已经解决了分布式调度
2. **改造成本高**: 需要为每个 cron 创建 HTTP trigger, 改变任务执行方式
3. **功能退化**: 失去 BullMQ 的 job 去重、自动重试、延迟执行、优先级等能力
4. **Cloud Scheduler 更适合**: 触发无状态的 Cloud Function / Cloud Run Job, 不适合已有队列系统

**推荐**: 保留内部 BullMQ cron, 仅在需要触发外部系统时考虑 Cloud Scheduler 作为补充。

---

## 4. Queue 方案对比

### 现状: BullMQ + Redis

6 个队列, 核心特性:

- `poster`: concurrency:1, rate limiter 1job/35s
- `scanner`: concurrency:1, 30min 定时
- Leader election 保证单实例调度
- Job 状态持久化到 MongoDB

### 方案 A: Google Cloud Pub/Sub


| 维度                | 评分    | 说明                               |
| ----------------- | ----- | -------------------------------- |
| **可靠性**           | ⭐⭐⭐⭐⭐ | 全球分布式, 99.95% SLA                |
| **Rate Limiting** | ⭐     | **无原生支持**, 需自行实现                 |
| **串行处理**          | ⭐⭐    | 需 ordering key, 无 concurrency 控制 |
| **延迟调度**          | ⭐     | **不支持** 延迟/定时发送                  |
| **成本**            | ⭐⭐⭐⭐  | 前 10GB/月免费                       |
| **改造成本**          | 大     | 需重写所有 queue 逻辑                   |


**Pub/Sub 关键缺失:**

- 无 rate limiter (poster 35s 限频无法实现)
- 无 delayed jobs
- 无 job 状态追踪 (completed/failed/waiting)
- 无 repeatable jobs (cron)
- At-least-once 语义, 需额外去重

### 方案 B: Google Cloud Tasks


| 维度                | 评分    | 说明                                |
| ----------------- | ----- | --------------------------------- |
| **可靠性**           | ⭐⭐⭐⭐⭐ | 全托管, 高可用                          |
| **Rate Limiting** | ⭐⭐⭐⭐  | **原生支持** `maxDispatchesPerSecond` |
| **串行处理**          | ⭐⭐⭐⭐  | `maxConcurrentDispatches: 1` 可串行  |
| **延迟调度**          | ⭐⭐⭐⭐  | 支持 `scheduleTime` 延迟              |
| **成本**            | ⭐⭐⭐⭐  | 前 100 万次/月免费                      |
| **改造成本**          | 中-大   | 需 HTTP handler, 改写 queue 逻辑       |


**Cloud Tasks 可行但受限:**

- 支持 rate limiting 和 concurrency 控制
- 但无 repeatable jobs, 需配合 Cloud Scheduler
- 无 job 状态追踪 (需自建)
- 任务执行依赖 HTTP endpoint

### 方案 C: 保留 BullMQ + Redis (推荐)


| 维度        | 评分    | 说明                                               |
| --------- | ----- | ------------------------------------------------ |
| **改造成本**  | ⭐⭐⭐⭐⭐ | 零改造                                              |
| **功能完整度** | ⭐⭐⭐⭐⭐ | rate limiter, concurrency, cron, delayed, 状态追踪全有 |
| **运维**    | ⭐⭐⭐   | 依赖 Redis (需 Memorystore 或自建)                     |
| **可观测性**  | ⭐⭐⭐   | BullMQ Dashboard 或自建                             |


### 对比总结


| 特性              | BullMQ      | Pub/Sub | Cloud Tasks     |
| --------------- | ----------- | ------- | --------------- |
| Rate Limiting   | ✅ 原生        | ❌ 无     | ✅ 原生            |
| Concurrency 控制  | ✅ per-queue | ❌ 无     | ✅ per-queue     |
| Delayed Jobs    | ✅           | ❌       | ✅               |
| Repeatable/Cron | ✅           | ❌       | ❌ (需 Scheduler) |
| Job 状态追踪        | ✅           | ❌       | ❌ (需自建)         |
| 改造成本            | 零           | 大       | 中-大             |
| 运维成本            | 需 Redis     | 全托管     | 全托管             |


**结论: 保留 BullMQ**, Pub/Sub 和 Cloud Tasks 均无法替代 BullMQ 的完整功能集, 且改造成本高。

---

## 5. Database 方案对比

### 现状: MongoDB 7

- 12+ collections, Mongoose ODM
- TTL index (AuditLog 90 天)
- 文档模型与业务高度匹配 (Feed, Persona, Trend 等嵌套结构)
- 预计数据量: 中等 (Feed 可达数万, AuditLog/QueueJob 持续增长)

### 方案 A: 继续用 MongoDB

**部署选项:**


| 选项                          | 成本/月      | 运维   | 适合场景                  |
| --------------------------- | --------- | ---- | --------------------- |
| **MongoDB Atlas (M0 Free)** | $0        | 全托管  | 开发/测试, 512MB 限制       |
| **MongoDB Atlas (M10)**     | ~$57      | 全托管  | 生产, 10GB, 自动备份        |
| **MongoDB Atlas (M20)**     | ~$140     | 全托管  | 生产, 更大存储, Replica Set |
| **VM 自建 MongoDB**           | $0 (VM 内) | 自行运维 | 低成本, 高运维              |


**优势:**

- ✅ 零迁移成本, 代码完全兼容
- ✅ Mongoose ODM 无需修改
- ✅ 文档模型与业务匹配
- ✅ Atlas 提供自动备份、监控、告警

**劣势:**

- ❌ Atlas 非 GCP 原生 (但有 GCP region 可选)
- ❌ 费用比 Cloud SQL 略高

### 方案 B: GCP Cloud SQL (PostgreSQL/MySQL)


| 维度         | 评分    | 说明                                    |
| ---------- | ----- | ------------------------------------- |
| **GCP 整合** | ⭐⭐⭐⭐⭐ | 原生 IAM, VPC, 备份                       |
| **成本**     | ⭐⭐⭐   | db-f1-micro ~$8/月, db-g1-small ~$26/月 |
| **性能**     | ⭐⭐⭐⭐  | 关系型查询优秀, 但文档查询需 JOIN                  |
| **迁移成本**   | ⭐     | **极大** — 需重写全部数据层                     |


**迁移 Cloud SQL 的代价:**

1. **Schema 重设计**: 12+ collections → 关系表, 嵌套文档 → 多表 JOIN
2. **ORM 替换**: Mongoose → Prisma/TypeORM/Knex, 涉及全部 Service 层
3. **查询重写**: MongoDB 聚合管道 → SQL, 所有 `.find()/.aggregate()` 改写
4. **索引重建**: 复合索引、TTL index → SQL equivalents
5. **Seed 脚本**: 所有数据导入脚本重写
6. **测试**: 108 个集成测试全部重写

**估计工作量: 3-6 周全职开发**, 且收益极小:

- 业务不需要 ACID 事务 (帖子审核流程是最终一致)
- 不需要复杂 JOIN (数据以文档为中心)
- 不需要关系完整性约束

### 对比总结


| 考量点     | MongoDB (Atlas) | Cloud SQL         |
| ------- | --------------- | ----------------- |
| 迁移成本    | 零               | 极大 (3-6 周)        |
| 业务匹配度   | 高 (文档模型)        | 中 (需 normalize)   |
| GCP 整合  | 中 (非原生)         | 高 (原生)            |
| 运维      | 低 (Atlas 全托管)   | 低 (Cloud SQL 全托管) |
| 月费 (生产) | ~$57 (M10)      | ~$26 (g1-small)   |


**结论: 继续用 MongoDB**, 迁移到关系型数据库无业务收益, 改造成本极高。

---

## 6. 专家讨论

### 参与角色

- **Cloud Architect (CA)** — GCP 基础设施专家
- **Backend Engineer (BE)** — Node.js / BullMQ 专家
- **DevOps Engineer (DO)** — CI/CD / 运维专家
- **Product Owner (PO)** — 业务需求方

---

**PO**: 我们的目标是什么？先明确优先级。

**CA**: 三个核心诉求：1) 低运维成本 — 团队小；2) 低费用 — 项目初期；3) 可靠性 — 自动发帖不能中断。

**BE**: 补充一点，BullMQ Worker 必须 24/7 运行。poster 队列的 35s rate limit 和 concurrency:1 是硬约束，任何方案都不能破坏这个。

---

**CA**: 先说 Server。Cloud Run 的主要问题在 Worker。Cloud Run 设计理念是 request-driven，而 Worker 是 always-running process。虽然可以用 `min-instances=1` 和 `always allocated CPU`，但这本质上是把 Cloud Run 当 VM 用，失去了 serverless 的成本优势。

**BE**: 同意。而且 Socket.io 在 Cloud Run 上有 3600s 连接限制。虽然客户端可以自动重连，但这增加了前端复杂度。对于只有 1-5 个管理员的场景，这个限制可以接受，但不够优雅。

**DO**: 我的建议是**分层部署**:

```
Frontend  → Cloud Storage + Cloud CDN (最便宜, 全球加速)
Backend   → Cloud Run (min-instances=1, 处理 API + WebSocket)
Worker    → Compute Engine VM (e2-micro/small, 24/7 运行)
MongoDB   → MongoDB Atlas (M10, 全托管)
Redis     → Cloud Memorystore (Basic, 1GB)
```

**CA**: 这样做的好处是每个组件用最合适的服务。Frontend 纯静态，Cloud Storage 最便宜。Backend API 流量低且不均，Cloud Run 按需付费合理。Worker 需要常驻，VM 最直接。

**BE**: 等等，这样 Backend 和 Worker 不在同一个网络，Redis 和 MongoDB 的连接需要额外配置。复杂度上去了。

**DO**: 确实。对于我们这个规模的项目，我觉得**单 VM 方案可能更务实**。

---

**CA**: 让我重新评估。项目特点:

- 低流量 (1-5 管理员)
- 需要 WebSocket
- 需要 BullMQ Worker 常驻
- 需要 Redis 和 MongoDB

**这些特点指向一个结论: 简单 VM + docker-compose 是最优解。**

**DO**: 同意。我们可以用 Cloud Build 做 CI/CD, 推 Docker image 到 Artifact Registry, 然后自动部署到 VM。

```
Git Push → Cloud Build → Build Images → Push to AR → Deploy to VM
```

**BE**: 数据库呢？MongoDB 是跑在 VM 里还是用 Atlas？

**CA**: 如果预算紧张，MongoDB 跑在 VM 里，用 volume 持久化，配合定期备份到 Cloud Storage。如果要可靠性，用 Atlas M10 (~$57/月)，但这比 VM 本身还贵。

**PO**: 初期预算有限，我们先跑 VM 里，稳定后再考虑 Atlas。

**DO**: 那备份策略要做好。建议:

1. VM disk snapshot (每日, 7 天保留)
2. mongodump 到 Cloud Storage (每日)
3. Redis RDB 备份 (已有 AOF)

---

**CA**: 那 Cron 和 Queue 呢？

**BE**: 保持现状。BullMQ 的功能集无可替代 — rate limiter, concurrency control, repeatable jobs, job status tracking。Pub/Sub 和 Cloud Tasks 都缺关键特性。

**CA**: Cloud Scheduler 呢？

**BE**: 没必要。我们已经有 Redis leader election + BullMQ repeatable jobs。Cloud Scheduler 只在你需要触发 serverless function 时有意义。我们的 Worker 是 long-running process，内部调度更高效。

**DO**: 唯一有价值的场景是：如果未来 Worker 迁到 Cloud Run Jobs，那 Cloud Scheduler 可以触发这些 Jobs。但目前不需要。

---

**PO**: 总结一下，我们的方案是？

**CA**: **Phase 1 (立即)**: 单 VM + docker-compose, 全栈部署
**Phase 2 (3-6 月后)**: 评估是否需要拆分 — Backend 到 Cloud Run, MongoDB 到 Atlas
**Phase 3 (规模化时)**: GKE 或完全 serverless 架构

**全员**: 同意。

---

## 7. 最终推荐方案

### Phase 1: 单 VM 部署 (推荐立即实施)

```
┌─────────────────────────────────────────────┐
│           Compute Engine VM (e2-small)       │
│           2 vCPU, 2GB RAM, ~$15/月           │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Frontend │  │ Backend  │  │  Worker  │   │
│  │ (Nginx)  │  │ (Express │  │ (BullMQ) │   │
│  │  :80     │  │  +WS)    │  │          │   │
│  │          │  │  :3000   │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│                                              │
│  ┌──────────┐  ┌──────────┐                  │
│  │ MongoDB  │  │  Redis   │                  │
│  │  :27017  │  │  :6379   │                  │
│  └──────────┘  └──────────┘                  │
│                                              │
│  Volumes: mongo-data, redis-data             │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Cloud Build (CI/CD) │
│ Git Push → Build →  │
│ Deploy to VM        │
└─────────────────────┘
```

### 各组件决策


| 组件           | 决策                | 理由                                            |
| ------------ | ----------------- | --------------------------------------------- |
| **Server**   | Compute Engine VM | Worker 需常驻; WebSocket 无限制; docker-compose 零改造 |
| **Cron**     | 保留 BullMQ 内部调度    | 已有完善的 leader election + repeatable jobs       |
| **Queue**    | 保留 BullMQ + Redis | rate limiter, concurrency, job tracking 不可替代  |
| **Database** | 保留 MongoDB (VM 内) | 零迁移成本; 文档模型匹配业务; 初期 Atlas 太贵                  |
| **CI/CD**    | Cloud Build       | Docker image → Artifact Registry → VM 部署      |
| **Frontend** | Nginx (VM 内)      | 流量极低, 无需 CDN; 简化架构                            |


### Phase 2: 混合部署 (可选, 视增长情况)

```
Frontend  → Cloud Storage + Cloud CDN
Backend   → Cloud Run (min-instances=1)
Worker    → 保留 VM 或迁移到 GKE
MongoDB   → MongoDB Atlas (M10)
Redis     → Cloud Memorystore (1GB Basic)
```

**触发条件:** 管理员超过 10 人, 或需要高可用 / 多区域部署时。

---

## 8. 成本估算

### Phase 1 月费


| 服务                | 规格                     | 月费 (USD)   |
| ----------------- | ---------------------- | ---------- |
| Compute Engine    | e2-small (2 vCPU, 2GB) | ~$15       |
| Persistent Disk   | 30GB SSD               | ~$5        |
| Cloud Build       | 120 min/月免费额度          | $0         |
| Artifact Registry | < 500MB                | ~$0.5      |
| Static IP         | 1 个                    | ~$3        |
| **合计**            |                        | **~$24/月** |


### Phase 2 月费 (如需升级)


| 服务                      | 规格                   | 月费 (USD)    |
| ----------------------- | -------------------- | ----------- |
| Cloud Run (Backend)     | min=1, 1 vCPU, 512MB | ~$15        |
| Compute Engine (Worker) | e2-micro             | ~$8         |
| MongoDB Atlas           | M10 (10GB)           | ~$57        |
| Cloud Memorystore       | 1GB Basic            | ~$35        |
| Cloud Storage + CDN     | < 1GB                | ~$1         |
| **合计**                  |                      | **~$116/月** |


---

## 9. 迁移路径

### Phase 1 实施步骤

```
1. 创建 GCP 项目 + 开启 API
   ├── Compute Engine API
   ├── Cloud Build API
   └── Artifact Registry API

2. 创建 VM
   ├── 机型: e2-small (或 e2-medium 如需余量)
   ├── OS: Ubuntu 22.04 LTS / Container-Optimized OS
   ├── Disk: 30GB SSD
   ├── 防火墙: 开放 80, 443
   └── 静态外部 IP

3. 配置 VM 环境
   ├── 安装 Docker + Docker Compose
   ├── 配置 .env.production
   ├── 设置 SSL (Let's Encrypt / Cloudflare)
   └── 配置日志 (Cloud Logging agent)

4. CI/CD 配置
   ├── cloudbuild.yaml: build + push images
   ├── 部署脚本: SSH 到 VM, docker-compose pull + up
   └── 触发器: main branch push

5. 备份策略
   ├── VM disk snapshot: 每日, 保留 7 天
   ├── mongodump → Cloud Storage: 每日
   └── 监控告警: uptime check + disk usage
```

### cloudbuild.yaml 示例

```yaml
steps:
  # Build backend
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}', './backend']

  # Build frontend
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/frontend:${SHORT_SHA}', './frontend']

  # Push images
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/frontend:${SHORT_SHA}']

  # Deploy to VM via SSH
  - name: 'gcr.io/cloud-builders/gcloud'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        gcloud compute ssh bk-admin-vm --zone=${_ZONE} --command="
          cd /opt/bk-admin &&
          docker-compose pull &&
          docker-compose up -d --remove-orphans
        "

substitutions:
  _REGION: asia-east1
  _ZONE: asia-east1-b

images:
  - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}'
  - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/frontend:${SHORT_SHA}'
```

---

## 10. 方案 A vs 方案 B 综合对比

> **方案 A**: VM + docker-compose (原方案, 零改造)
> **方案 B**: Cloud Run + Cloud Tasks + Cloud Scheduler (全托管, 去 Redis)

### 10.1 优缺点全面对比

#### 方案 A: VM + docker-compose


| 优点                                 | 缺点                                             |
| ---------------------------------- | ---------------------------------------------- |
| ✅ **零改造成本** — docker-compose 直接部署  | ❌ **运维负担重** — OS 补丁、安全更新、磁盘监控                  |
| ✅ **架构简单** — 单 VM 一键启动全栈           | ❌ **单点故障** — VM 宕机 = 全部停止                      |
| ✅ **内网通信快** — 所有服务在同一台机器           | ❌ **扩展困难** — 纵向扩展有上限, 横向需大改                    |
| ✅ **调试方便** — SSH 进去直接 docker logs  | ❌ **备份需自建** — mongodump + cron + Cloud Storage |
| ✅ **WebSocket 无限制** — 如果后续恢复需要     | ❌ **资源浪费** — 低流量时 VM 仍在收费                      |
| ✅ **固定成本可预测** — $24/月不变            | ❌ **Redis 单点** — 内存不足或宕机影响所有队列                 |
| ✅ **团队学习成本低** — docker-compose 人人会 | ❌ **SSL/域名需手动** — Let's Encrypt 配置 + 续签        |


#### 方案 B: Cloud Run + Cloud Tasks (全托管)


| 优点                                             | 缺点                                            |
| ---------------------------------------------- | --------------------------------------------- |
| ✅ **零运维** — 无服务器管理, 无 OS 补丁                    | ❌ **迁移成本** — ~5-6 天开发改造                       |
| ✅ **自动扩缩** — 0→N, 低流量可缩至 0                     | ❌ **冷启动** — 缩至 0 时首次请求 2-5s 延迟                |
| ✅ **消除 Redis** — 减少一个基础设施依赖                    | ❌ **Atlas 费用** — 生产 M10 ~$57/月                |
| ✅ **高可用内建** — GCP 多区域, 自动故障转移                  | ❌ **调试复杂** — 需通过 Cloud Logging 查日志            |
| ✅ **按量付费** — 开发环境几乎免费                          | ❌ **GCP 锁定** — Cloud Tasks API 非标准            |
| ✅ **原生监控** — Cloud Monitoring 开箱即用             | ❌ **Queue pause/resume 需改造** — 改用 config flag |
| ✅ **SSL 自动** — Cloud Run 自带 HTTPS              | ❌ **本地开发需模拟** — 需 emulator 或降级方案              |
| ✅ **CI/CD 更简单** — Cloud Build → Cloud Run 一步到位 | ❌ **多服务协调** — Scheduler + Tasks + Run 配置多     |


### 10.2 成本深度对比

#### 运行成本 (月费)


| 场景                              | 方案 A (VM)           | 方案 B (全托管)         | 差额          |
| ------------------------------- | ------------------- | ------------------ | ----------- |
| **开发/测试**                       | $15 (e2-small 不能关)  | ~$1 (全部缩至 0)       | **B 省 $14** |
| **生产 (低流量)**                    | ~$24                | ~$66 (含 Atlas M10) | A 省 $42     |
| **生产 (中流量)**                    | ~$30 (升级 e2-medium) | ~$70               | A 省 $40     |
| **生产 (不用 Atlas, 用 VM MongoDB)** | ~$24                | N/A (无 VM)         | —           |


> **注:** 方案 B 的主要费用来自 MongoDB Atlas ($57/月)。如果有自建 MongoDB 的途径（如另一台小 VM），生产成本可降至 ~$15/月。

#### 运行成本明细

**方案 A 明细:**


| 项目                                    | 月费 (USD) |
| ------------------------------------- | -------- |
| Compute Engine e2-small (2 vCPU, 2GB) | $15.33   |
| Persistent Disk 30GB SSD              | $5.10    |
| Static IP                             | $2.88    |
| Cloud Build (免费额度)                    | $0       |
| Artifact Registry (<500MB)            | ~$0.50   |
| Snapshot 备份 (30GB × 7 天)              | ~$1.40   |
| **合计**                                | **~$25** |


**方案 B 明细:**


| 项目                                    | 月费 (USD) |
| ------------------------------------- | -------- |
| Cloud Run Backend (min=0, ~5k req/天)  | ~$0-5    |
| Cloud Run Worker (min=0, ~200 task/天) | ~$0-3    |
| Cloud Tasks (前 100 万次免费)              | $0       |
| Cloud Scheduler (6 jobs × $0.10)      | $0.60    |
| MongoDB Atlas M10 (生产)                | $57      |
| MongoDB Atlas M0 (开发, 免费)             | $0       |
| Cloud Storage + CDN (<1GB)            | ~$0.50   |
| Cloud Build (免费额度)                    | $0       |
| **合计 (开发)**                           | **~$1**  |
| **合计 (生产)**                           | **~$66** |


#### 迁移成本 (一次性)


| 项目           | 方案 A                       | 方案 B                            |
| ------------ | -------------------------- | ------------------------------- |
| **代码改造**     | 0 天                        | 5-6 天                           |
| **GCP 环境配置** | 1 天 (VM + Docker)          | 2 天 (Run + Tasks + Scheduler)   |
| **CI/CD 搭建** | 1 天 (Cloud Build → VM SSH) | 0.5 天 (Cloud Build → Cloud Run) |
| **域名 + SSL** | 0.5 天 (Let's Encrypt 手动)   | 0.5 天 (Cloud Run 自动)            |
| **数据迁移**     | 0.5 天 (mongodump/restore)  | 0.5 天 (同上)                      |
| **测试验证**     | 1 天                        | 2 天 (新架构需额外验证)                  |
| **合计**       | **~4 天**                   | **~11 天**                       |


#### 隐性成本对比


| 项目                 | 方案 A                              | 方案 B                     |
| ------------------ | --------------------------------- | ------------------------ |
| 每月运维时间             | ~2-4 小时 (更新、监控、备份检查)              | ~0.5 小时 (偶尔看看 dashboard) |
| 故障恢复时间             | 高 (需 SSH 排查, 可能需重建 VM)            | 低 (Cloud Run 自动重启)       |
| 安全更新               | 需手动 (apt update, Docker image 更新) | 自动 (只管 app image)        |
| 年化运维人力成本 (按 $50/h) | ~$1,200-2,400                     | ~$300                    |


### 10.3 风险对比


| 风险            | 方案 A           | 方案 B                      |
| ------------- | -------------- | ------------------------- |
| VM 宕机         | 🔴 全栈停止, 需手动恢复 | ✅ N/A                     |
| Redis OOM     | 🔴 队列全停        | ✅ 无 Redis                 |
| MongoDB 损坏    | 🔴 需从备份恢复      | 🟡 Atlas 自动备份/恢复          |
| DDoS          | 🔴 VM 直接承受     | 🟡 Cloud Run 自动扩缩+限流      |
| 代码 bug 导致内存泄漏 | 🔴 影响同 VM 其他服务 | 🟡 容器隔离, 自动重启             |
| GCP 服务中断      | 🟡 VM 级别       | 🟡 Cloud Run 级别           |
| 供应商锁定         | ✅ Docker 可迁任何云 | 🔴 Cloud Tasks API 绑定 GCP |


### 10.4 适用场景建议

**选方案 A 的情况:**

- 预算极度敏感 (生产 $25 vs $66)
- 团队不熟悉 GCP 托管服务
- 需要最快上线 (4 天 vs 11 天)
- 后续可能恢复 WebSocket
- 希望保持云平台可移植性

**选方案 B 的情况:**

- 重视零运维 (团队精力有限)
- 有多套环境 (dev/staging/prod, 方案 B 闲时几乎免费)
- 重视高可用和自动恢复
- 接受 Atlas 费用
- 长期项目, 运维人力成本远超云费用差额

### 10.5 推荐: 渐进式迁移路线

如果无法一步到位, 可以分三步走:

```
Step 1 (立即): VM + docker-compose          → 最快上线, $25/月
Step 2 (1-3月): 去掉 Socket.io + 前端上 CDN  → 为全托管铺路
Step 3 (3-6月): BullMQ → Cloud Tasks         → 全托管, 去 Redis
```

每一步都可以独立停下, 不强制继续。

---

## 11. GCP Docker 部署支持

### 11.1 GCP 支持 Docker 吗？

**完全支持。** GCP 是对 Docker 支持最好的云平台之一:


| GCP 服务                | Docker 支持方式                           | 适合场景              |
| --------------------- | ------------------------------------- | ----------------- |
| **Cloud Run**         | 直接部署 Docker image                     | 无状态 HTTP 服务, 自动扩缩 |
| **Compute Engine**    | VM 上装 Docker / Container-Optimized OS | 有状态服务, 长运行进程      |
| **GKE (Kubernetes)**  | Docker container 编排                   | 大规模微服务            |
| **Artifact Registry** | Docker image 仓库 (替代 Docker Hub)       | 所有方案的 image 存储    |
| **Cloud Build**       | Docker build + push 自动化               | CI/CD pipeline    |


### 11.2 各方案的 Docker 使用方式

#### 方案 A: VM + docker-compose

```
本地开发 (docker-compose.yml)
     ↓ 完全相同
VM 生产 (docker-compose.production.yml)
```

**项目已有的 Docker 文件可直接使用:**

- `frontend/Dockerfile` — 多阶段构建 (Node build → Nginx serve)
- `backend/Dockerfile` — 多阶段构建 (TypeScript compile → Node production)
- `docker-compose.yml` — 开发环境编排
- `docker-compose.production.yml` — 生产资源限制覆写
- `frontend/nginx.conf` — Nginx 反代 + SPA 路由 + 静态资源缓存

**GCP 上运行 docker-compose 的两种方式:**


| 方式                               | 说明                                        | 推荐度                          |
| -------------------------------- | ----------------------------------------- | ---------------------------- |
| **Ubuntu VM + Docker Engine**    | `apt install docker.io docker-compose-v2` | ⭐⭐⭐⭐ 灵活, 标准                  |
| **Container-Optimized OS (COS)** | GCP 官方 Docker 优化 OS, 自带 Docker            | ⭐⭐⭐ 更安全, 但不支持 docker-compose |


> **注:** COS 不支持 docker-compose, 需要用 `docker run` 逐个启动, 或改用 Kubernetes。推荐直接用 Ubuntu + Docker。

#### 方案 B: Cloud Run (直接部署 Docker image)

```
Cloud Build:
  1. docker build -t backend:tag ./backend
  2. docker build -t frontend:tag ./frontend   (仅打包静态文件)
  3. docker push → Artifact Registry
  4. gcloud run deploy → Cloud Run
```

Cloud Run 本质就是运行 Docker container, 项目现有 Dockerfile **无需任何修改** 即可部署到 Cloud Run。

### 11.3 Artifact Registry (Docker Image 仓库)

无论方案 A 还是 B, 都建议使用 Artifact Registry 存储 Docker image:

```bash
# 创建仓库
gcloud artifacts repositories create bk-admin \
  --repository-format=docker \
  --location=asia-east1

# 构建 & 推送
docker build -t asia-east1-docker.pkg.dev/PROJECT/bk-admin/backend:v1 ./backend
docker push asia-east1-docker.pkg.dev/PROJECT/bk-admin/backend:v1
```

费用: 存储 $0.10/GB/月, 前 500MB 免费。

---

## 12. 部署实施方案

### 12.1 方案 A 部署: VM + docker-compose

#### 前置准备

```bash
# 1. 创建 GCP 项目
gcloud projects create bk-admin-prod
gcloud config set project bk-admin-prod

# 2. 开启需要的 API
gcloud services enable compute.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

#### Step 1: 创建 VM

```bash
# 创建静态 IP
gcloud compute addresses create bk-admin-ip \
  --region=asia-east1

# 创建 VM (Ubuntu 22.04, e2-small)
gcloud compute instances create bk-admin-vm \
  --zone=asia-east1-b \
  --machine-type=e2-small \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-ssd \
  --address=bk-admin-ip \
  --tags=http-server,https-server

# 开放 HTTP/HTTPS
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80,tcp:443 \
  --target-tags=http-server,https-server
```

#### Step 2: 初始化 VM 环境

```bash
# SSH 进入 VM
gcloud compute ssh bk-admin-vm --zone=asia-east1-b

# 安装 Docker + Docker Compose
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
# 重新登录生效

# 创建项目目录
sudo mkdir -p /opt/bk-admin
sudo chown $USER:$USER /opt/bk-admin
```

#### Step 3: 配置生产环境

```bash
# 上传 docker-compose 文件
cd /opt/bk-admin

# .env.production (需手动配置)
cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb://mongodb:27017/baby-kingdom
REDIS_URL=redis://redis:6379
JWT_SECRET=<生成随机密钥>
JWT_REFRESH_SECRET=<生成随机密钥>
AES_KEY=<生成随机密钥>
GEMINI_API_KEY=<你的 API Key>
BK_BASE_URL=https://bapi.baby-kingdom.com/index.php
FRONTEND_URL=https://your-domain.com
LOG_LEVEL=info
EOF
```

#### Step 4: 部署

```bash
# 拉取代码并构建
git clone <repo-url> /opt/bk-admin/app
cd /opt/bk-admin/app

# 生产部署 (使用 production overlay)
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build

# 验证
docker compose ps
curl http://localhost/api/health
```

#### Step 5: SSL 配置 (Nginx + Let's Encrypt)

```bash
# 安装 certbot
sudo apt install -y certbot

# 获取证书 (需要先将域名解析到 VM IP)
sudo certbot certonly --standalone -d your-domain.com

# 修改 nginx.conf 添加 SSL (或在 VM 上用 host nginx 反代)
```

#### Step 6: CI/CD (Cloud Build)

```yaml
# cloudbuild.yaml
steps:
  # Build images
  - name: 'gcr.io/cloud-builders/docker'
    args: ['compose', '-f', 'docker-compose.yml', 'build']

  # Tag & push to Artifact Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['tag', 'baby-kingdom-new-backend',
           '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['tag', 'baby-kingdom-new-frontend',
           '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/frontend:${SHORT_SHA}']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/frontend:${SHORT_SHA}']

  # Deploy to VM
  - name: 'gcr.io/cloud-builders/gcloud'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        gcloud compute ssh bk-admin-vm --zone=${_ZONE} --command="
          cd /opt/bk-admin/app &&
          git pull origin main &&
          docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
        "

substitutions:
  _REGION: asia-east1
  _ZONE: asia-east1-b

options:
  logging: CLOUD_LOGGING_ONLY
```

#### Step 7: 备份策略

```bash
# 自动磁盘快照 (每日, 保留 7 天)
gcloud compute resource-policies create snapshot-schedule bk-daily-backup \
  --region=asia-east1 \
  --max-retention-days=7 \
  --daily-schedule \
  --start-time=04:00

gcloud compute disks add-resource-policies bk-admin-vm \
  --resource-policies=bk-daily-backup \
  --zone=asia-east1-b

# MongoDB 备份到 Cloud Storage (cron on VM)
# /opt/bk-admin/backup.sh
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec $(docker ps -qf "name=mongodb") mongodump --archive --gzip \
  | gsutil cp - gs://bk-admin-backups/mongo/backup_${TIMESTAMP}.gz

# crontab -e
# 0 3 * * * /opt/bk-admin/backup.sh
```

#### 方案 A 完整架构图

```
┌─ Internet ──────────────────────────────────────┐
│                                                  │
│  DNS: your-domain.com → Static IP                │
│                                                  │
└──────────────┬───────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────┐
│        Compute Engine VM (e2-small)               │
│        Ubuntu 22.04 + Docker                      │
│                                                   │
│  ┌─ docker-compose ──────────────────────────┐    │
│  │                                           │    │
│  │  Nginx (:80/:443) ──→ Backend (:3000)     │    │
│  │    │ 静态文件          │ REST API          │    │
│  │    │ /api/* 反代       │ Socket.io         │    │
│  │    │                   │                   │    │
│  │  Worker ──→ Redis (:6379)                 │    │
│  │    │ BullMQ   │ 队列 backend              │    │
│  │    │ Cron     │ Leader election           │    │
│  │    │          │ Socket adapter            │    │
│  │    │                                      │    │
│  │    └──→ MongoDB (:27017)                  │    │
│  │          │ 12+ collections                │    │
│  │          │ Volume: mongo-data             │    │
│  └───────────────────────────────────────────┘    │
│                                                   │
│  Cron: mongodump → Cloud Storage (每日)            │
│  Snapshot: 磁盘快照 (每日, 7 天保留)                │
└───────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐    ┌─────────────────────┐
│ Cloud Build (CI/CD) │    │ Cloud Storage        │
│ Git → Build → SSH   │    │ MongoDB 备份         │
│ Deploy to VM        │    │                      │
└─────────────────────┘    └─────────────────────┘
```

---

### 12.2 方案 B 部署: Cloud Run 全托管

#### 前置准备

```bash
# 1. 创建 GCP 项目 & 开启 API
gcloud projects create bk-admin-prod
gcloud config set project bk-admin-prod

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com
```

#### Step 1: 创建 Artifact Registry

```bash
gcloud artifacts repositories create bk-admin \
  --repository-format=docker \
  --location=asia-east1
```

#### Step 2: 部署 Backend API 到 Cloud Run

```bash
# 构建并推送 image (使用现有 backend/Dockerfile, 无需修改)
gcloud builds submit ./backend \
  --tag asia-east1-docker.pkg.dev/PROJECT/bk-admin/backend:latest

# 部署到 Cloud Run
gcloud run deploy bk-backend \
  --image asia-east1-docker.pkg.dev/PROJECT/bk-admin/backend:latest \
  --region asia-east1 \
  --platform managed \
  --allow-unauthenticated \
  --port 3000 \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "NODE_ENV=production,MONGO_URI=mongodb+srv://...,..." \
  --timeout 300
```

#### Step 3: 部署 Worker Service 到 Cloud Run

Worker 需改造为 HTTP handler 后部署 (使用新的 worker Dockerfile):

```bash
# 部署 Worker (仅接受来自 Cloud Tasks 的请求)
gcloud run deploy bk-worker \
  --image asia-east1-docker.pkg.dev/PROJECT/bk-admin/worker:latest \
  --region asia-east1 \
  --platform managed \
  --no-allow-unauthenticated \
  --port 3001 \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "NODE_ENV=production,MONGO_URI=mongodb+srv://..." \
  --timeout 600
```

#### Step 4: 部署前端到 Cloud Storage + CDN

```bash
# 本地构建前端
cd frontend && npm run build

# 创建 Storage bucket
gsutil mb -l asia-east1 gs://bk-admin-frontend

# 上传静态文件
gsutil -m rsync -r -d dist/ gs://bk-admin-frontend

# 设置为网站
gsutil web set -m index.html -e index.html gs://bk-admin-frontend

# 公开访问
gsutil iam ch allUsers:objectViewer gs://bk-admin-frontend

# (可选) 配置 Cloud CDN + Load Balancer 绑定域名
```

#### Step 5: 创建 Cloud Tasks 队列

```bash
# Poster 队列 (关键: rate limit 1/35s)
gcloud tasks queues create poster-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-dispatches-per-second=0.028 \
  --max-attempts=3 \
  --min-backoff=30s \
  --max-backoff=300s

# Scanner 队列
gcloud tasks queues create scanner-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2 \
  --max-backoff=600s

# Trends 队列
gcloud tasks queues create trends-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

# Daily-reset 队列
gcloud tasks queues create daily-reset-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

# Stats 队列
gcloud tasks queues create stats-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

# Google Trends 队列
gcloud tasks queues create gtrends-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2
```

#### Step 6: 创建 Cloud Scheduler 定时任务

```bash
WORKER_URL="https://bk-worker-xxxxx-de.a.run.app"
SA_EMAIL="bk-scheduler@PROJECT.iam.gserviceaccount.com"

# 创建专用 Service Account
gcloud iam service-accounts create bk-scheduler
gcloud run services add-iam-policy-binding bk-worker \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker" \
  --region=asia-east1

# Scanner: 每 30 分钟
gcloud scheduler jobs create http scanner-cron \
  --location=asia-east1 \
  --schedule="*/30 * * * *" \
  --uri="${WORKER_URL}/tasks/scanner" \
  --http-method=POST \
  --body='{"triggeredBy":"cron"}' \
  --oidc-service-account-email=${SA_EMAIL} \
  --time-zone="Asia/Hong_Kong"

# Trends: 每小时
gcloud scheduler jobs create http trends-cron \
  --location=asia-east1 \
  --schedule="0 * * * *" \
  --uri="${WORKER_URL}/tasks/trends" \
  --http-method=POST \
  --body='{"triggeredBy":"cron"}' \
  --oidc-service-account-email=${SA_EMAIL} \
  --time-zone="Asia/Hong_Kong"

# Daily Reset: 每天午夜 HKT
gcloud scheduler jobs create http daily-reset-cron \
  --location=asia-east1 \
  --schedule="0 0 * * *" \
  --uri="${WORKER_URL}/tasks/daily-reset" \
  --http-method=POST \
  --body='{"triggeredBy":"cron"}' \
  --oidc-service-account-email=${SA_EMAIL} \
  --time-zone="Asia/Hong_Kong"

# Stats: 每小时 :05
gcloud scheduler jobs create http stats-cron \
  --location=asia-east1 \
  --schedule="5 * * * *" \
  --uri="${WORKER_URL}/tasks/stats" \
  --http-method=POST \
  --body='{"triggeredBy":"cron"}' \
  --oidc-service-account-email=${SA_EMAIL} \
  --time-zone="Asia/Hong_Kong"

# Google Trends: 每 30 分钟
gcloud scheduler jobs create http gtrends-cron \
  --location=asia-east1 \
  --schedule="*/30 * * * *" \
  --uri="${WORKER_URL}/tasks/google-trends" \
  --http-method=POST \
  --body='{"triggeredBy":"cron"}' \
  --oidc-service-account-email=${SA_EMAIL} \
  --time-zone="Asia/Hong_Kong"

# Health Check: 每 5 分钟
gcloud scheduler jobs create http health-cron \
  --location=asia-east1 \
  --schedule="*/5 * * * *" \
  --uri="${WORKER_URL}/tasks/health" \
  --http-method=POST \
  --oidc-service-account-email=${SA_EMAIL} \
  --time-zone="Asia/Hong_Kong"
```

#### Step 7: CI/CD (Cloud Build → Cloud Run)

```yaml
# cloudbuild.yaml
steps:
  # Build backend
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}', './backend']

  # Build worker (改造后有单独 Dockerfile)
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/worker:${SHORT_SHA}', '-f', './backend/Dockerfile.worker', './backend']

  # Build frontend
  - name: 'node:20-alpine'
    entrypoint: 'sh'
    args: ['-c', 'cd frontend && npm ci && npm run build']

  # Push images
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/worker:${SHORT_SHA}']

  # Deploy backend to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['gcloud', 'run', 'deploy', 'bk-backend',
           '--image', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}',
           '--region', '${_REGION}']

  # Deploy worker to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['gcloud', 'run', 'deploy', 'bk-worker',
           '--image', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/worker:${SHORT_SHA}',
           '--region', '${_REGION}']

  # Deploy frontend to Cloud Storage
  - name: 'gcr.io/cloud-builders/gsutil'
    args: ['-m', 'rsync', '-r', '-d', 'frontend/dist/', 'gs://bk-admin-frontend/']

substitutions:
  _REGION: asia-east1

options:
  logging: CLOUD_LOGGING_ONLY
```

#### 方案 B 完整架构图

```
┌─ Internet ─────────────────────────────────────────────┐
│                                                         │
│  admin.your-domain.com → Cloud Run (Backend API)        │
│  your-domain.com       → Cloud Storage + CDN (Frontend) │
│                                                         │
└─────────┬──────────────────────────┬───────────────────┘
          │                          │
┌─────────▼──────────┐   ┌──────────▼──────────────┐
│ Cloud Run           │   │ Cloud Storage + CDN      │
│ bk-backend          │   │ bk-admin-frontend        │
│  /api/v1/*          │   │  index.html              │
│  POST /queues/      │   │  assets/*.js/*.css       │
│   trigger → Task    │   │                          │
└─────────┬──────────┘   └──────────────────────────┘
          │
          │ (手动触发 → 创建 Cloud Task)
          ▼
┌─────────────────────────────────────────────────────┐
│ Cloud Scheduler              Cloud Tasks             │
│  6 cron rules ──────────→  6 queues                  │
│  */30 scanner                poster: 1/35s rate      │
│  0 * trends                  scanner: concurrent=1   │
│  0 0 daily-reset             trends: concurrent=1    │
│  5 * stats                   ...                     │
│  */30 gtrends                                        │
│  */5 health          ────────────────→               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Cloud Run        │
              │ bk-worker        │
              │  POST /tasks/*   │
              │  (无状态 HTTP)    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ MongoDB Atlas    │
              │  M0 (dev, 免费)  │
              │  M10 (prod)      │
              │  自动备份         │
              └─────────────────┘

 ❌ 无 Redis
 ❌ 无 VM
 ❌ 无 Socket.io
 ❌ 无 Leader Election
```

---

## 13. 方案修订: 去 WebSocket + GCP 全托管队列

> 更新日期: 2026-04-09
> 背景: Socket.io WebSocket 后续不再需要; 重新评估 BullMQ → GCP 托管队列的可行性

### 13.1 去掉 Socket.io 后的影响

去掉 WebSocket 后，Cloud Run 的主要限制消失:


| 之前的顾虑                   | 去掉 WebSocket 后   |
| ----------------------- | ---------------- |
| 3600s 连接时长限制            | 不再相关             |
| 冷启动导致 WebSocket 断连      | 不再相关             |
| 需要 Redis adapter 做多实例广播 | **Redis 依赖减少一层** |


**结论:** Backend API 变成纯 REST，Cloud Run 成为理想选择。

### 13.2 BullMQ 实际使用分析

审查 `worker.ts` 后发现，BullMQ 的使用比预想的轻量:


| BullMQ 功能          | 是否使用 | 说明                                          |
| ------------------ | ---- | ------------------------------------------- |
| 基本生产/消费            | ✅    | 全部 6 个队列                                    |
| `concurrency: 1`   | ✅    | 全部 6 个队列                                    |
| `limiter: 1/35s`   | ✅    | **仅 poster 队列**                             |
| Queue pause/resume | ✅    | scanner, trends, google-trends              |
| Job data 传递        | ✅    | poster (feedId), 其他 (triggeredBy)           |
| Cron 调度            | ❌    | 用的是 `node-cron` 库，不是 BullMQ repeatable jobs |
| Job 状态追踪           | ❌    | 自己写到 MongoDB (`recordJob`)，不依赖 BullMQ       |
| Delayed jobs       | ❌    | 未使用                                         |
| Priority           | ❌    | 未使用                                         |


**核心发现:** Cron 调度和 Job 状态追踪都是独立实现的，BullMQ 实际只充当 "带 concurrency 和 rate limit 的任务队列"。

### 13.3 Cloud Tasks + Cloud Scheduler 替代方案

#### 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                      GCP 全托管架构                           │
│                                                              │
│  ┌─────────────────────────────────────────────┐             │
│  │ Cloud Scheduler (替代 node-cron)             │             │
│  │  ├── */30 * * * *  → scanner-queue          │             │
│  │  ├── 0 * * * *     → trends-queue           │             │
│  │  ├── 0 16 * * *    → daily-reset-queue      │             │
│  │  ├── 5 * * * *     → stats-queue            │             │
│  │  ├── */30 * * * *  → gtrends-queue          │             │
│  │  └── */5 * * * *   → health-check (直接HTTP)│             │
│  └─────────────────────────────────────────────┘             │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────┐             │
│  │ Cloud Tasks (替代 BullMQ, 6 queues)          │             │
│  │  ├── poster-queue:    maxConcurrent=1        │             │
│  │  │                    rate=0.028/s (~1/35s)  │             │
│  │  ├── scanner-queue:   maxConcurrent=1        │             │
│  │  ├── trends-queue:    maxConcurrent=1        │             │
│  │  ├── daily-reset-queue: maxConcurrent=1      │             │
│  │  ├── stats-queue:     maxConcurrent=1        │             │
│  │  └── gtrends-queue:   maxConcurrent=1        │             │
│  └─────────────────────────────────────────────┘             │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────┐             │
│  │ Cloud Run — Worker Service (HTTP handler)    │             │
│  │  POST /tasks/scanner       → scanForumThreads│             │
│  │  POST /tasks/trends        → pullTrends      │             │
│  │  POST /tasks/poster        → postFeed        │             │
│  │  POST /tasks/daily-reset   → resetCounters   │             │
│  │  POST /tasks/stats         → aggregateStats  │             │
│  │  POST /tasks/google-trends → pullAndStore    │             │
│  └─────────────────────────────────────────────┘             │
│                                                              │
│  ┌─────────────────────────────────────────────┐             │
│  │ Cloud Run — Backend API (纯 REST)            │             │
│  │  /api/v1/*  (65+ endpoints)                  │             │
│  │  POST /api/v1/queues/:name/trigger           │             │
│  │    → 创建 Cloud Task (手动触发入口)           │             │
│  └─────────────────────────────────────────────┘             │
│                                                              │
│  ┌──────────────┐                                            │
│  │ MongoDB Atlas │ (唯一的数据存储)                            │
│  └──────────────┘                                            │
│                                                              │
│  ❌ 不再需要 Redis                                            │
│  ❌ 不再需要 Socket.io                                        │
│  ❌ 不再需要 Leader Election                                  │
└──────────────────────────────────────────────────────────────┘
```

#### Cloud Tasks 功能覆盖验证


| BullMQ 需求                 | Cloud Tasks 方案                       | 状态          |
| ------------------------- | ------------------------------------ | ----------- |
| 串行处理 (concurrency:1)      | `maxConcurrentDispatches: 1`         | ✅ 完全覆盖      |
| Poster rate limit (1/35s) | `maxDispatchesPerSecond: 0.028`      | ✅ 完全覆盖      |
| Job data 传递               | HTTP request body (JSON)             | ✅ 完全覆盖      |
| 自动重试                      | 内置指数退避 (可配 maxAttempts)              | ✅ 完全覆盖      |
| Cron 调度                   | Cloud Scheduler 发 HTTP → Cloud Tasks | ✅ 完全覆盖      |
| Job 状态追踪                  | 保留现有 `recordJob()` 写 MongoDB         | ✅ 无需改动      |
| Queue pause/resume        | MongoDB config flag 开关               | ⚠️ 需改造 (见下) |
| 幂等性 (poster)              | 保留现有 `feed.postId` 检查                | ✅ 无需改动      |


#### Queue Pause/Resume 替代方案

当前 BullMQ 的 `queue.isPaused()` 在 cron 触发时检查。迁移后:

```typescript
// 方案 A: Worker HTTP handler 内检查 (推荐)
app.post('/tasks/scanner', async (req, res) => {
  const paused = await configService.getValue('SCANNER_PAUSED');
  if (paused === 'true') {
    // 直接返回 200，Cloud Tasks 认为成功，不重试
    return res.json({ skipped: true, reason: 'queue paused' });
  }
  const stats = await scanForumThreads();
  await recordJob('scanner', { ... });
  res.json({ success: true, stats });
});

// 方案 B: Cloud Tasks Queue 级别暂停
// gcloud tasks queues pause scanner-queue
// gcloud tasks queues resume scanner-queue
// 缺点: 需要 gcloud CLI 或 API 调用，不如 config flag 灵活
```

### 13.4 GCP 托管 vs BullMQ 特点对比


| 维度        | BullMQ + Redis                     | Cloud Tasks + Scheduler               |
| --------- | ---------------------------------- | ------------------------------------- |
| **运维负担**  | 需维护 Redis (内存、持久化、监控)              | 零运维，GCP 全托管                           |
| **高可用**   | Redis 单点风险 (Memorystore HA ~$70/月) | 内建 99.5% SLA，无需额外配置                   |
| **水平扩展**  | Leader election 协调多 Worker         | GCP 自动分布式调度                           |
| **成本模型**  | 固定费 (Redis 实例按时计费)                 | 按量付费 (前 100 万次/月免费)                   |
| **冷启动**   | 无 (Worker 常驻进程)                    | Cloud Run 可能 2-5s (poster 35s 间隔内不影响) |
| **监控告警**  | 需自建 BullMQ Dashboard               | GCP Console 原生: 队列深度、延迟、错误率           |
| **日志**    | 自建 (pino logger)                   | Cloud Logging 自动采集, 可查询               |
| **代码复杂度** | Worker 进程 + leader election + cron | 无状态 HTTP handler, 更简单                 |
| **故障恢复**  | Redis 宕机 = 队列全停                    | Cloud Tasks 自动重试 + 死信队列               |
| **调度精度**  | node-cron 秒级                       | Cloud Scheduler 分钟级 (足够)              |


### 13.5 最大收益: 消除 Redis 依赖

去掉 Socket.io + BullMQ 后，Redis 的三个用途全部消失:


| Redis 用途              | 替代                      |
| --------------------- | ----------------------- |
| BullMQ 队列 backend     | Cloud Tasks             |
| Socket.io 多实例 adapter | 不再需要 WebSocket          |
| Leader election 分布式锁  | Cloud Scheduler 天然单实例调度 |


**架构简化:**

```
之前: Backend + Worker + MongoDB + Redis + Frontend (5 组件)
之后: Cloud Run (API) + Cloud Run (Worker) + MongoDB Atlas (3 组件)
     + Cloud Tasks + Cloud Scheduler (全托管, 无需管理)
```

### 13.6 改造工作量


| 改造项                    | 工作量        | 详情                                         |
| ---------------------- | ---------- | ------------------------------------------ |
| Worker 改为 HTTP handler | 1-2 天      | 6 个 POST endpoint, 业务逻辑不变, 只换触发方式          |
| Queue service 改写       | 1 天        | `queue.add()` → Cloud Tasks `createTask()` |
| 移除 Redis 依赖            | 0.5 天      | 删除 redis.ts, socket.ts, leader election 代码 |
| 移除 Socket.io           | 0.5 天      | 删除 socket 相关代码, 前端移除 socket 监听             |
| Cloud Scheduler 配置     | 0.5 天      | 6 条 cron 规则 (gcloud / Terraform)           |
| Cloud Tasks queue 配置   | 0.5 天      | 6 个 queue (含 poster rate limit)            |
| Queue pause/resume 改造  | 0.5 天      | 改用 MongoDB config flag                     |
| 测试调整                   | 1 天        | Queue 相关集成测试重写                             |
| **合计**                 | **~5-6 天** |                                            |


### 13.7 修订后的推荐方案

#### 新 Phase 1: GCP 全托管 (替代原 VM 方案)


| 组件              | 服务                     | 理由                                     |
| --------------- | ---------------------- | -------------------------------------- |
| **Backend API** | Cloud Run              | 纯 REST, 按需扩缩, 低流量极便宜                   |
| **Worker**      | Cloud Run (HTTP)       | 无状态 handler, Cloud Tasks 触发            |
| **Cron**        | Cloud Scheduler        | 替代 node-cron + leader election         |
| **Queue**       | Cloud Tasks            | 替代 BullMQ, 原生 rate limit + concurrency |
| **Database**    | MongoDB Atlas (M0→M10) | 全托管, 自动备份                              |
| **Frontend**    | Cloud Storage + CDN    | 静态资源, 全球加速                             |
| **Redis**       | ❌ 不需要                  | 三个用途全部被替代                              |


#### 修订后成本估算


| 服务                  | 规格                 | 月费 (USD)   |
| ------------------- | ------------------ | ---------- |
| Cloud Run (Backend) | min=0, 按请求计费       | ~$0-5      |
| Cloud Run (Worker)  | min=0, 按 task 触发   | ~$0-3      |
| Cloud Tasks         | < 100 万次/月         | $0 (免费额度)  |
| Cloud Scheduler     | 6 jobs             | ~$0.60     |
| MongoDB Atlas       | M0 (开发) / M10 (生产) | $0 / ~$57  |
| Cloud Storage       | < 1GB              | ~$0.03     |
| Cloud Build         | 免费额度               | $0         |
| **合计 (开发)**         |                    | **~$1/月**  |
| **合计 (生产)**         |                    | **~$66/月** |


#### 与原 VM 方案对比


| 维度       | 原方案 (VM)                       | 修订方案 (全托管) |
| -------- | ------------------------------ | ---------- |
| 月费 (生产)  | ~$24 (但需自运维 Redis/MongoDB)     | ~$66 (全托管) |
| 月费 (开发)  | ~$15 (VM 不能关)                  | ~$1 (缩至 0) |
| 运维负担     | 中-高 (OS 补丁, Redis, MongoDB 备份) | 极低 (只管代码)  |
| 高可用      | 需自行配置                          | 内建         |
| 扩展性      | 手动                             | 自动         |
| 代码改造     | 零                              | ~5-6 天     |
| Redis 依赖 | 需要                             | 移除         |


### 13.8 修订后的决策矩阵


| 决策点          | 原推荐              | 修订推荐                      | 变更原因                       |
| ------------ | ---------------- | ------------------------- | -------------------------- |
| **Server**   | ✅ VM             | ✅ **Cloud Run**           | 去掉 WebSocket 后无限制          |
| **Cron**     | ✅ BullMQ 内部      | ✅ **Cloud Scheduler**     | 无需 Redis + leader election |
| **Queue**    | ✅ BullMQ         | ✅ **Cloud Tasks**         | 功能够用, 移除 Redis 依赖          |
| **Database** | ✅ MongoDB (VM 内) | ✅ **MongoDB Atlas**       | 全托管, 无 VM 则无法自建            |
| **Redis**    | ✅ VM 内           | ❌ **移除**                  | 三个用途全部被替代                  |
| **Frontend** | ✅ VM Nginx       | ✅ **Cloud Storage + CDN** | 无 VM 则用 Storage            |
| **CI/CD**    | ✅ Cloud Build    | ✅ Cloud Build (不变)        | —                          |


---

## 附录: 方案决策矩阵

### 初始评估 (含 WebSocket + BullMQ)


| 决策点              | 选项                               | 推荐                   | 核心理由                           |
| ---------------- | -------------------------------- | -------------------- | ------------------------------ |
| **Server**       | Cloud Run vs VM                  | ✅ VM                 | Worker 常驻需求 + WebSocket + 简单架构 |
| **Cron**         | Cloud Scheduler vs BullMQ        | ✅ BullMQ             | 零改造, 功能更完整                     |
| **Queue**        | Pub/Sub vs Cloud Tasks vs BullMQ | ✅ BullMQ             | rate limiter 不可替代              |
| **Database**     | Cloud SQL vs MongoDB             | ✅ MongoDB            | 零迁移, 文档模型匹配                    |
| **MongoDB Host** | Atlas vs VM 内                    | ✅ VM 内 (Phase 1)     | 初期省钱, 后期可迁 Atlas               |
| **Redis Host**   | Memorystore vs VM 内              | ✅ VM 内 (Phase 1)     | 初期省钱, 后期可迁                     |
| **Frontend**     | Cloud Storage vs VM Nginx        | ✅ VM Nginx (Phase 1) | 简化架构, 流量极低                     |
| **CI/CD**        | Cloud Build                      | ✅ Cloud Build        | GCP 原生, 免费额度够用                 |


### 修订评估 (去 WebSocket + 全托管)


| 决策点          | 原推荐              | 修订推荐                      | 变更原因                       |
| ------------ | ---------------- | ------------------------- | -------------------------- |
| **Server**   | ✅ VM             | ✅ **Cloud Run**           | 去掉 WebSocket 后无限制          |
| **Cron**     | ✅ BullMQ 内部      | ✅ **Cloud Scheduler**     | 无需 Redis + leader election |
| **Queue**    | ✅ BullMQ         | ✅ **Cloud Tasks**         | 功能够用, 移除 Redis 依赖          |
| **Database** | ✅ MongoDB (VM 内) | ✅ **MongoDB Atlas**       | 全托管, 无 VM 则无法自建            |
| **Redis**    | ✅ VM 内           | ❌ **移除**                  | 三个用途全部被替代                  |
| **Frontend** | ✅ VM Nginx       | ✅ **Cloud Storage + CDN** | 无 VM 则用 Storage            |
| **CI/CD**    | ✅ Cloud Build    | ✅ Cloud Build (不变)        | —                          |


