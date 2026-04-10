# GCP Console 部署操作指南

基于 Cloud Run + Cloud Scheduler 的完整部署步骤。

---

## 第一步：创建项目

**位置：** Console 顶部下拉 → 新建项目

- 项目名：`baby-kingdom`（或任意名称）
- 记住项目 ID，后续所有服务都在这个项目下

---

## 第二步：开启需要的 API

**位置：** 左侧菜单 → API 和服务 → 库

| API | 搜索关键词 |
|-----|----------|
| Cloud Run Admin API | cloud run |
| Cloud Build API | cloud build |
| Artifact Registry API | artifact registry |
| Cloud Scheduler API | cloud scheduler |
| Memorystore for Redis API | memorystore |

---

## 第三步：创建 Artifact Registry 仓库（存放 Docker 镜像）

**位置：** 左侧菜单 → Artifact Registry → 创建代码库

| 字段 | 值 |
|------|---|
| 名称 | `bk` |
| 格式 | Docker |
| 区域 | `asia-east1`（台湾，离香港最近） |

**作用：** GCP 的 Docker 镜像仓库。Cloud Build 构建好的镜像推到这里，Cloud Run 从这里拉取镜像运行。相当于私有的 Docker Hub。

---

## 第四步：创建 Memorystore for Redis 实例

**位置：** 左侧菜单 → Memorystore → Redis → 创建实例

| 字段 | 值 |
|------|---|
| 实例 ID | `bk-redis` |
| 等级 | 基本（Basic） |
| 容量 | 1 GB |
| 区域 | `asia-east1` |
| 已授权网络 | default |

**作用：** 替代本地的 Redis 容器。BullMQ 队列、Socket.io adapter、分布式锁都依赖它。创建完成后会得到一个内网 IP（如 `10.0.0.3`），填到环境变量 `REDIS_HOST` 里。

---

## 第五步：创建 Cloud Run 服务（3 个）

**位置：** 左侧菜单 → Cloud Run → 创建服务

### 服务 1：bk-backend（API 服务）

| 字段 | 值 |
|------|---|
| 服务名称 | `bk-backend` |
| 区域 | `asia-east1` |
| 容器映像 | 先选「持续部署 - 从源代码库设置」或稍后手动部署 |
| 端口 | `3000` |
| CPU | 1 |
| 内存 | 512 MB |
| 最小实例数 | `1`（避免冷启动，WebSocket 需要常驻） |
| 最大实例数 | `3` |
| 环境变量 | `MONGO_URI`、`REDIS_HOST`、`JWT_SECRET` 等 |

**作用：** 运行 Express API + Socket.io，处理所有 `/api/*` 请求。

### 服务 2：bk-worker（后台 Worker）

| 字段 | 值 |
|------|---|
| 服务名称 | `bk-worker` |
| 区域 | `asia-east1` |
| 容器映像 | 与 backend 同一个镜像 |
| **容器命令** | `node` |
| **容器参数** | `dist/worker.js` |
| 端口 | 不需要（可保留 3000 但不会有外部流量） |
| CPU | 1 |
| 内存 | 512 MB |
| 最小实例数 | `1`（必须常驻，否则没人消费队列） |
| 最大实例数 | `1`（只需要一个 worker） |
| 入口流量 | 内部（不需要外部访问） |

**作用：** 就是 `docker-compose.yml` 里的 worker 容器。它不接收 HTTP 请求，而是持续运行，从 Redis 中的 BullMQ 队列取任务并执行（扫描论坛、拉取 trends、发帖等）。

> "后台工作池" 指的就是这个 — 一个持续运行的容器，专门消费异步任务队列。

### 服务 3：bk-frontend（前端）

| 字段 | 值 |
|------|---|
| 服务名称 | `bk-frontend` |
| 区域 | `asia-east1` |
| 容器映像 | frontend Dockerfile 构建的镜像 |
| 端口 | `80` |
| CPU | 1 |
| 内存 | 256 MB |
| 最小实例数 | `0`（静态站点可以缩到 0） |
| 最大实例数 | `2` |

**作用：** Nginx 托管 Vue SPA，反代 `/api/` 和 `/socket.io/` 到 `bk-backend`。

> 注意：`nginx.conf` 里 `proxy_pass http://backend:3000` 需要改为 `bk-backend` 的 Cloud Run 内部 URL。

---

## 第六步：创建 Cloud Scheduler 作业（定时触发）

**位置：** 左侧菜单 → Cloud Scheduler → 创建作业

| 名称 | 频率 | 时区 | HTTP 方法 | URL |
|------|------|------|----------|-----|
| `bk-scanner-check` | `*/5 * * * *` | Asia/Hong_Kong | POST | `https://bk-backend-xxx.run.app/api/v1/scanner/trigger` |
| `bk-trends-pull` | `0 * * * *` | Asia/Hong_Kong | POST | `https://bk-backend-xxx.run.app/api/v1/trends/trigger` |
| `bk-gtrends-pull` | `*/30 * * * *` | Asia/Hong_Kong | POST | `https://bk-backend-xxx.run.app/api/v1/google-trends/trigger` |
| `bk-health-check` | `*/5 * * * *` | Asia/Hong_Kong | GET | `https://bk-backend-xxx.run.app/api/health` |

每个作业需要配置 Auth header（OIDC token）来通过 Cloud Run 的认证。

**作用：** 替代 Worker 里的 node-cron。Cloud Scheduler 到时间就发 HTTP 请求给 backend，backend 收到后往 BullMQ 队列加任务，Worker 消费执行。

---

## 第七步（可选）：设置 Cloud Build 自动部署

**位置：** 左侧菜单 → Cloud Build → 触发器 → 创建触发器

| 字段 | 值 |
|------|---|
| 名称 | `deploy-on-push` |
| 事件 | 推送到分支 |
| 分支 | `^main$` |
| 配置 | Cloud Build 配置文件 (`cloudbuild.yaml`) |

**作用：** `git push` 到 main 分支后自动构建 + 部署，无需手动操作。

---

## 整体架构图

```
用户浏览器
    ↓
Cloud Run: bk-frontend (Nginx, 端口 80)
    ↓ /api/* 反代
Cloud Run: bk-backend (Express, 端口 3000)
    ↓ 入队任务到 Redis
Memorystore: bk-redis
    ↑ 消费队列任务
Cloud Run: bk-worker (BullMQ, 常驻)

Cloud Scheduler → 定时 HTTP → bk-backend → 入队 → bk-worker 执行

MongoDB Atlas（外部）← bk-backend + bk-worker 都连接
```

---

## 创建服务总结

| 你要创建的 | 个数 | 做什么用 |
|-----------|------|---------|
| Artifact Registry 仓库 | 1 | 存 Docker 镜像 |
| Cloud Run 服务 | 3 | backend、worker、frontend |
| Memorystore Redis | 1 | BullMQ 队列 + Socket.io |
| Cloud Scheduler 作业 | 4-6 | 定时触发任务 |
| Cloud Build 触发器 | 1（可选） | CI/CD 自动部署 |
| MongoDB | 外部 Atlas 或 GCE VM | 数据库 |
