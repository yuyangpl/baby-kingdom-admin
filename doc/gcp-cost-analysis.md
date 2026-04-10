# GCP 部署费用分析 — Baby Kingdom Admin

> 日期: 2026-04-10
> 架构: Cloud Run + Cloud SQL + Cloud Tasks + Cloud Scheduler

---

## 生产环境月费明细

| 服务 | 用途 | 规格 | 计费模式 | 月费 (USD) |
|---|---|---|---|---|
| **Cloud SQL** | PostgreSQL 15 数据库 | db-f1-micro (共享 vCPU, 614MB) | 实例 24/7 运行 | **~$8.00** |
| Cloud SQL 存储 | 数据存储 | 10GB SSD | $0.17/GB | ~$1.70 |
| Cloud SQL 备份 | 自动每日备份 | ~10GB | $0.08/GB | ~$0.80 |
| **Cloud Run (Backend)** | API 服务 (65+ endpoints) | 1 vCPU, 512MB, min=0 | 按请求 + CPU 时间 | **~$3-5** |
| **Cloud Run (Worker)** | 6 个任务处理器 | 1 vCPU, 512MB, min=0 | 按 task 触发 | **~$1-3** |
| Cloud Tasks | 6 个任务队列 | poster 1/35s rate limit | 前 100 万次/月免费 | **$0** |
| Cloud Scheduler | 6 个 cron jobs | 5m~24h 间隔 | $0.10/job/月 | **~$0.60** |
| Cloud Storage | 前端 SPA 静态资源 | <1GB | 存储 + 出流量 | **~$0.03** |
| Artifact Registry | Docker 镜像仓库 | <500MB (2 images) | $0.10/GB | **~$0.05** |
| Cloud Build | CI/CD pipeline | ~5 分钟/次构建 | 每天 120 分钟免费 | **$0** |
| Secret Manager | 6 个密钥 | JWT/AES/DB/Gemini | 前 6 版本免费 | **~$0** |
| **合计 (低流量)** | | | | **~$16-20/月** |
| **合计 (中流量)** | | | | **~$25-32/月** |

---

## 费用分布

```
Cloud SQL    ████████████████████  ~55%  ($8-10)   ← 唯一固定成本
Cloud Run    ████████              ~25%  ($4-8)    ← 按请求，闲时趋零
存储/备份     ███                   ~15%  ($2-3)    ← SSD + 备份 + 镜像
调度/队列     █                     ~5%   ($0.60)   ← 几乎免费
```

---

## 按使用场景估算

| 场景 | 描述 | 月费 |
|---|---|---|
| **闲置** | 无流量，Cloud Run 缩至 0 | ~$10 (Cloud SQL + 存储) |
| **低流量** | 1-2 管理员，每天 <100 次操作 | ~$16-20 |
| **正常使用** | 3-5 管理员，Scanner/Poster 正常运行 | ~$25-32 |
| **开发环境** | 本地 docker-compose.dev.yml | **$0** |
| **GCP 开发环境** | Cloud SQL 运行，Cloud Run 缩至 0 | ~$10 |

---

## Cloud Run 计费详解

Cloud Run 按三个维度计费（min-instances=0 时，无流量 = $0）：

| 资源 | 价格 | 预计用量/月 | 费用 |
|---|---|---|---|
| CPU | $0.00002400/vCPU-s | ~50,000 vCPU-s | ~$1.20 |
| 内存 | $0.00000250/GiB-s | ~25,000 GiB-s | ~$0.06 |
| 请求 | $0.40/百万次 | ~150,000 次 | ~$0.06 |
| **Backend 小计** | | | **~$1.32** |
| **Worker 小计** | | | **~$0.80** |

> 免费额度: 每月 180,000 vCPU-s + 360,000 GiB-s + 200 万次请求。低流量场景可能完全免费。

---

## Cloud SQL 计费详解

| 项目 | db-f1-micro | db-g1-small |
|---|---|---|
| vCPU | 共享 | 共享 |
| 内存 | 614 MB | 1.7 GB |
| 月费 (asia-east1) | **~$8.56** | **~$26.73** |
| 存储 (10GB SSD) | $1.70 | $1.70 |
| 备份 (10GB) | $0.80 | $0.80 |
| **合计** | **~$11.06** | **~$29.23** |

> db-f1-micro 适合初期。如果查询慢或连接数不足，升级到 db-g1-small。

---

## 与原方案对比

| 方案 | 月费 (生产) | 月费 (开发) | 运维负担 |
|---|---|---|---|
| **VM + docker-compose + MongoDB** | ~$24 | ~$15 (不能关) | 中-高 |
| **Cloud Run + MongoDB Atlas M10** | ~$66 | ~$1 | 低 |
| **Cloud Run + Cloud SQL** (当前) | **~$16-32** | **~$0-10** | **极低** |

### 优势

- 比 VM 方案便宜（低流量时），且零运维
- 比 Atlas 方案便宜 $30-40/月（Cloud SQL $8 vs Atlas M10 $57）
- 开发环境几乎免费（Cloud Run 缩至 0）
- 无需管理 OS、安全补丁、Redis、备份脚本

---

## 免费额度

| 服务 | 免费额度 | 是否够用 |
|---|---|---|
| Cloud Run | 180k vCPU-s, 2M 请求/月 | 低流量完全覆盖 |
| Cloud Tasks | 100 万次/月 | 绰绰有余 |
| Cloud Build | 120 分钟/天 | 够用 |
| Cloud Storage | 5GB | 够用 |
| Secret Manager | 6 个 secret, 10k 次访问 | 够用 |
| Cloud Scheduler | 3 jobs 免费 | 6 jobs 需 $0.60 |
| **Cloud SQL** | **无免费额度** | **必须付费** |

> Cloud SQL 是唯一没有持续免费额度的服务。新用户 $300 试用金可覆盖约 3 个月。

---

## 省钱策略

| 策略 | 节省 | 操作 |
|---|---|---|
| GCP 免费试用 ($300) | 前 3 个月免费 | 新项目自动获得 |
| 非工作时间停止 Cloud SQL | ~$4/月 | `gcloud sql instances patch --activation-policy=NEVER` |
| 承诺使用折扣 (CUD) 1 年 | ~25% on Cloud SQL | 确认长期使用后购买 |
| 持续使用折扣 (SUD) | ~20% on Cloud Run | 自动，无需操作 |
| 保持 min-instances=0 | Cloud Run 闲时 $0 | 接受 2-5s 冷启动 |
| 设 min-instances=1 (避免冷启动) | +$15/月 | 仅在体验要求高时 |

---

## 年化成本预估

| 场景 | 月费 | 年费 |
|---|---|---|
| 最低 (闲置 + Cloud SQL) | $10 | **$120** |
| 低流量 (1-2 管理员) | $18 | **$216** |
| 正常使用 (3-5 管理员) | $28 | **$336** |
| 含 min-instances=1 | $43 | **$516** |
