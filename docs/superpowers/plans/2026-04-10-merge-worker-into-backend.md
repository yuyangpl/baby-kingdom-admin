# 合并 Worker 到 Backend — 砍掉 Cloud Run Worker 节省成本

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Worker HTTP 服务的 4 个保留端点合并到 Backend，砍掉 Worker Cloud Run 服务；用进程内 cron 替代 3 个被砍的 Cloud Scheduler job（daily-reset、stats、health），节省约 $1-3/月。

**Architecture:** Worker 的 `/tasks/*` 端点迁移为 Backend 的路由模块 `modules/tasks/`。Backend `server.ts` 启动时注册 `node-cron` 定时任务替代被砍的 3 个 Scheduler job。`queue.service.ts` 的 `dispatchToWorker()` 改为直接调用本地函数，不再 HTTP 请求外部服务。

**Tech Stack:** TypeScript, Express, Prisma, node-cron (已有依赖)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/src/modules/tasks/tasks.routes.ts` | 4 个保留的 task 端点（scanner/trends/poster/gtrends） |
| Create | `backend/src/modules/tasks/tasks.controller.ts` | Task 请求处理逻辑（从 worker-http.ts 提取） |
| Modify | `backend/src/app.ts` | 注册 `/tasks` 路由 |
| Modify | `backend/src/server.ts` | 添加 node-cron：daily-reset + stats + health + token/log cleanup |
| Modify | `backend/src/modules/queue/queue.service.ts` | 删除 `dispatchToWorker`，`addToQueue` 改为直接调用 task handler |
| Modify | `cloudbuild.yaml` | 删除 Worker build/push/deploy 步骤 |
| Modify | `scripts/setup-gcp.sh` | 删除 bk-worker-sa |
| Modify | `scripts/setup-scheduler.sh` | 只保留 3 个 job，target 改为 Backend URL |
| Modify | `docker-compose.yml` | 删除 worker 服务 |
| Modify | `doc/gcp-cost-analysis.md` | 更新费用 |
| Delete | `backend/src/worker-http.ts` | 不再需要 |
| Delete | `backend/src/worker.ts` | 不再需要（旧 BullMQ worker） |
| Delete | `backend/Dockerfile.worker` | 不再需要 |

---

### Task 1: 创建 tasks 路由模块（从 worker-http.ts 提取）

**Files:**
- Create: `backend/src/modules/tasks/tasks.controller.ts`
- Create: `backend/src/modules/tasks/tasks.routes.ts`

- [ ] **Step 1: 创建 tasks.controller.ts**

```typescript
// backend/src/modules/tasks/tasks.controller.ts
import { Request, Response } from 'express';
import { getPrisma } from '../../shared/database.js';
import { recordJob } from '../queue/queue.service.js';
import { scanBoard, getBoardsDueForScan } from '../scanner/scanner.service.js';
import { pullTrends } from '../trends/trends.service.js';
import { postFeed } from '../poster/poster.service.js';
import { pullAndStore } from '../google-trends/google-trends.service.js';
import * as configService from '../config/config.service.js';
import logger from '../../shared/logger.js';

export async function scannerTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('SCANNER_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { fid, triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
    if (fid) {
      const stats = await scanBoard(fid);
      await recordJob('scanner', { status: 'completed', startedAt, completedAt: new Date(), result: stats, triggeredBy });
      res.json({ success: true, stats });
    } else {
      const boards = await getBoardsDueForScan();
      const results = [];
      for (const board of boards) {
        const stats = await scanBoard(board.fid);
        results.push(stats);
      }
      await recordJob('scanner', { status: 'completed', startedAt, completedAt: new Date(), result: { boards: results.length }, triggeredBy });
      res.json({ success: true, boards: results.length, results });
    }
  } catch (err: any) {
    await recordJob('scanner', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Scanner task failed');
    res.status(500).json({ error: err.message });
  }
}

export async function trendsTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('TRENDS_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
    const result = await pullTrends();
    const pulled = Array.isArray(result.trends) ? result.trends.length : 0;
    await recordJob('trends', { status: 'completed', startedAt, completedAt: new Date(), result: { pulled, feedsGenerated: result.feedsGenerated }, triggeredBy });
    res.json({ success: true, pulled, feedsGenerated: result.feedsGenerated });
  } catch (err: any) {
    await recordJob('trends', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Trends task failed');
    res.status(500).json({ error: err.message });
  }
}

export async function posterTask(req: Request, res: Response): Promise<void> {
  const { feedId, triggeredBy = 'manual' } = req.body || {};
  if (!feedId) {
    res.status(400).json({ error: 'feedId is required' });
    return;
  }

  const prisma = getPrisma();
  const startedAt = new Date();

  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed || feed.postId) {
    res.json({ skipped: true, reason: feed ? 'already posted' : 'not found' });
    return;
  }

  if (triggeredBy === 'approve') {
    const board = feed.threadFid ? await prisma.forumBoard.findFirst({ where: { fid: feed.threadFid } }) : null;
    if (!board?.enableAutoReply) {
      res.json({ skipped: true, reason: 'auto-reply disabled' });
      return;
    }
  }

  try {
    const result = await postFeed(feedId, undefined, '');
    await recordJob('poster', { status: 'completed', startedAt, completedAt: new Date(), result: { feedId: (result as any).feedId, postId: (result as any).postId }, triggeredBy });
    res.json({ success: true, posted: true });
  } catch (err: any) {
    await recordJob('poster', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err, feedId }, 'Poster task failed');
    res.status(500).json({ error: err.message });
  }
}

export async function gtrendsTask(req: Request, res: Response): Promise<void> {
  const paused = await configService.getValue('GTRENDS_PAUSED');
  if (paused === 'true') {
    res.json({ skipped: true, reason: 'paused' });
    return;
  }

  const { triggeredBy = 'cron' } = req.body || {};
  const startedAt = new Date();

  try {
    const result = await pullAndStore();
    await recordJob('google-trends', { status: 'completed', startedAt, completedAt: new Date(), result, triggeredBy });
    res.json({ success: true, pullId: result.pullId, count: result.count });
  } catch (err: any) {
    await recordJob('google-trends', { status: 'failed', startedAt, completedAt: new Date(), error: err.message, triggeredBy });
    logger.error({ err }, 'Google Trends task failed');
    res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: 创建 tasks.routes.ts**

```typescript
// backend/src/modules/tasks/tasks.routes.ts
import { Router } from 'express';
import { scannerTask, trendsTask, posterTask, gtrendsTask } from './tasks.controller.js';

const router = Router();

router.post('/scanner', scannerTask);
router.post('/trends', trendsTask);
router.post('/poster', posterTask);
router.post('/gtrends', gtrendsTask);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/tasks/
git commit -m "feat: 创建 tasks 路由模块，从 worker-http.ts 提取 4 个 task 端点"
```

---

### Task 2: 注册 tasks 路由到 Backend app

**Files:**
- Modify: `backend/src/app.ts:24` (import 区域末尾)
- Modify: `backend/src/app.ts:64` (routes 注册区域末尾)

- [ ] **Step 1: 在 app.ts 中添加 import 和路由注册**

在 `import googleTrendsRoutes` 之后添加：

```typescript
import tasksRoutes from './modules/tasks/tasks.routes.js';
```

在 `app.use('/api/v1/google-trends', googleTrendsRoutes);` 之后添加：

```typescript
// Task endpoints (called by Cloud Scheduler, no auth required)
app.use('/tasks', tasksRoutes);
```

注意：`/tasks` 路由不经过 `/api/` 前缀，也不需要 JWT 认证（Cloud Scheduler 通过 OIDC 认证）。

- [ ] **Step 2: Commit**

```bash
git add backend/src/app.ts
git commit -m "feat: 注册 /tasks 路由到 Backend app"
```

---

### Task 3: Backend server.ts 添加进程内 cron（替代被砍的 3 个 Scheduler job）

**Files:**
- Modify: `backend/src/server.ts`

- [ ] **Step 1: 修改 server.ts，添加 node-cron 定时任务**

将 `backend/src/server.ts` 完整替换为：

```typescript
import 'dotenv/config';
import cron from 'node-cron';
import app from './app.js';
import { connectDB, disconnectDB, getPrisma } from './shared/database.js';
import { initQueues, recordJob } from './modules/queue/queue.service.js';
import { seedAdmin, cleanupExpiredTokens } from './modules/auth/auth.service.js';
import { seed as seedConfigs } from './modules/config/config.service.js';
import { cleanupOldLogs } from './modules/audit/audit.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import { runHealthCheck } from './shared/health-monitor.js';
import { CONFIG_PRESETS } from './seeds/config.seeds.js';
import logger from './shared/logger.js';

const PORT: string | number = process.env.PORT || 3000;

async function start(): Promise<void> {
  await connectDB();
  await seedAdmin();
  await seedConfigs(CONFIG_PRESETS);

  // Initialize queue service
  initQueues();

  // --- In-process Cron Jobs (replaces Cloud Scheduler for internal tasks) ---

  // Daily reset: midnight HKT (UTC+8 → 16:00 UTC previous day)
  cron.schedule('0 0 * * *', async () => {
    const startedAt = new Date();
    try {
      const prisma = getPrisma();
      await prisma.persona.updateMany({ data: { postsToday: 0, cooldownUntil: null } });
      const tokensRemoved = await cleanupExpiredTokens();
      const logsRemoved = await cleanupOldLogs();
      await recordJob('daily-reset', { status: 'completed', startedAt, completedAt: new Date(), result: { reset: true, tokensRemoved, logsRemoved }, triggeredBy: 'cron' });
      logger.info({ tokensRemoved, logsRemoved }, 'Daily reset + cleanup completed');
    } catch (err) {
      await recordJob('daily-reset', { status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: 'cron' });
      logger.error({ err }, 'Daily reset failed');
    }
  }, { timezone: 'Asia/Hong_Kong' });

  // Stats aggregator: every hour at :05
  cron.schedule('5 * * * *', async () => {
    const startedAt = new Date();
    try {
      await aggregateDailyStats();
      await recordJob('stats-aggregator', { status: 'completed', startedAt, completedAt: new Date(), result: { aggregated: true }, triggeredBy: 'cron' });
    } catch (err) {
      await recordJob('stats-aggregator', { status: 'failed', startedAt, completedAt: new Date(), error: (err as Error).message, triggeredBy: 'cron' });
      logger.error({ err }, 'Stats aggregation failed');
    }
  });

  // Health monitor: every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runHealthCheck();
    } catch (err) {
      logger.error({ err }, 'Health check failed');
    }
  });

  logger.info('In-process cron registered: daily-reset(0:00 HKT), stats(:05), health(5m)');

  app.listen(PORT, () => {
    logger.info(`Backend API listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully`);
    await disconnectDB();
    logger.info('Server shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat: 添加进程内 cron（daily-reset/stats/health），替代 Cloud Scheduler"
```

---

### Task 4: 简化 queue.service.ts — 删除 dispatchToWorker，改为本地调用

**Files:**
- Modify: `backend/src/modules/queue/queue.service.ts`

- [ ] **Step 1: 删除 dispatchToWorker 函数和 WORKER_SERVICE_URL 相关代码**

删除以下代码（第 11-54 行）：

```typescript
// Worker HTTP service URL (local dev or Cloud Run)
function getWorkerUrl(): string {
  return process.env.WORKER_SERVICE_URL || `http://localhost:${process.env.WORKER_PORT || 3001}`;
}

// Task endpoint mapping
const TASK_ENDPOINTS: Record<string, string> = {
  scanner: '/tasks/scanner',
  trends: '/tasks/trends',
  poster: '/tasks/poster',
  'daily-reset': '/tasks/daily-reset',
  'stats-aggregator': '/tasks/stats',
  'google-trends': '/tasks/gtrends',
};

/**
 * Dispatch a task to the worker HTTP service.
 * In local dev: direct HTTP call to worker-http.ts
 * In production: will be replaced by Cloud Tasks createTask()
 */
async function dispatchToWorker(queueName: string, data: any): Promise<void> {
  const endpoint = TASK_ENDPOINTS[queueName];
  if (!endpoint) {
    logger.warn({ queueName }, 'No task endpoint mapped for queue');
    return;
  }

  const workerUrl = getWorkerUrl();
  try {
    const resp = await fetch(`${workerUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const body = await resp.text();
      logger.warn({ queueName, status: resp.status, body }, 'Worker dispatch returned non-OK');
    }
  } catch (err) {
    // Non-fatal: worker might not be running in dev
    logger.warn({ err, queueName, workerUrl }, 'Failed to dispatch to worker (is worker-http running?)');
  }
}
```

- [ ] **Step 2: 从 triggerQueue 和 addToQueue 中删除 dispatchToWorker 调用**

在 `triggerQueue` 函数中（约第 163 行），删除：
```typescript
  // Dispatch to worker HTTP service
  dispatchToWorker(name, { triggeredBy: 'manual', triggeredByUser: userId });
```

在 `addToQueue` 函数中（约第 279-280 行），删除：
```typescript
  // Dispatch to worker HTTP service
  dispatchToWorker(queueName, data);
```

`addToQueue` 现在只记录 DB 记录。实际任务执行由 Cloud Scheduler 调用 `/tasks/*` 端点触发，或由手动 `triggerQueue` 直接调用。

- [ ] **Step 3: 更新 triggerQueue 改为直接 HTTP 调用本服务的 /tasks 端点**

将 `triggerQueue` 函数中删除的 `dispatchToWorker` 替换为：

```typescript
  // Dispatch task locally (same process)
  const TASK_ENDPOINTS: Record<string, string> = {
    scanner: '/tasks/scanner',
    trends: '/tasks/trends',
    poster: '/tasks/poster',
    'google-trends': '/tasks/gtrends',
  };
  const endpoint = TASK_ENDPOINTS[name];
  if (endpoint) {
    const port = process.env.PORT || 3000;
    fetch(`http://localhost:${port}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'manual', triggeredByUser: userId }),
      signal: AbortSignal.timeout(30000),
    }).catch(err => logger.warn({ err, name }, 'Local task dispatch failed'));
  }
```

注意：daily-reset 和 stats-aggregator 不在映射中，因为它们现在由进程内 cron 处理，不支持手动触发（或可通过 API 直接调用 service 函数）。

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/queue/queue.service.ts
git commit -m "refactor: 删除 dispatchToWorker，task 调度改为本地调用"
```

---

### Task 5: 删除 Worker 相关文件

**Files:**
- Delete: `backend/src/worker-http.ts`
- Delete: `backend/src/worker.ts`
- Delete: `backend/Dockerfile.worker`

- [ ] **Step 1: 删除 3 个文件**

```bash
rm backend/src/worker-http.ts
rm backend/src/worker.ts
rm backend/Dockerfile.worker
```

- [ ] **Step 2: Commit**

```bash
git add -u backend/src/worker-http.ts backend/src/worker.ts backend/Dockerfile.worker
git commit -m "chore: 删除 Worker 相关文件（worker-http.ts, worker.ts, Dockerfile.worker）"
```

---

### Task 6: 更新 docker-compose.yml — 删除 worker 服务

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 删除 worker 服务定义**

删除 `docker-compose.yml` 中整个 `worker:` 服务块（约第 41-60 行）：

```yaml
  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: ["node", "dist/worker.js"]
    env_file:
      - .env.development
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "import('ioredis').then(m=>{const r=new m.default();r.ping().then(()=>{r.disconnect();process.exit(0)}).catch(()=>process.exit(1))})"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - backend-net
    restart: unless-stopped
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: docker-compose 删除 worker 服务"
```

---

### Task 7: 更新 cloudbuild.yaml — 删除 Worker 构建和部署

**Files:**
- Modify: `cloudbuild.yaml`

- [ ] **Step 1: 删除 Worker 相关的所有步骤和配置**

需要删除的内容：
1. substitutions 中的 `_WORKER_SA` 变量
2. `build-worker` 步骤（Build worker image）
3. `push-worker` 步骤
4. `deploy-worker` 步骤
5. images 列表中 worker 相关的 2 行

同时更新 `deploy-backend` 步骤：
- `--timeout` 从 `60s` 改为 `300s`（因为 Backend 现在也处理 scanner/poster 等耗时任务）
- `--set-secrets` 添加 `GEMINI_API_KEY`（原来只在 Worker 上）

最终 cloudbuild.yaml 应只有 backend build → push → migrate → deploy-backend → deploy-frontend 5 个主要步骤。

- [ ] **Step 2: Commit**

```bash
git add cloudbuild.yaml
git commit -m "chore: cloudbuild 删除 Worker 构建和部署步骤"
```

---

### Task 8: 更新 setup-gcp.sh — 删除 Worker SA

**Files:**
- Modify: `scripts/setup-gcp.sh`

- [ ] **Step 1: 修改 setup-gcp.sh**

需要改动：
1. 删除 `create_sa "bk-worker-sa" "BK Worker Service"` 行
2. 删除 `WORKER_SA` 变量定义
3. IAM 授权的 for 循环只保留 `BACKEND_SA`
4. 验证步骤中删除 `check "SA: bk-worker-sa"` 行
5. Backend SA 额外授予 GEMINI_API_KEY 访问权限（原来在 Worker 上）

- [ ] **Step 2: Commit**

```bash
git add scripts/setup-gcp.sh
git commit -m "chore: setup-gcp 删除 Worker SA，简化 IAM 授权"
```

---

### Task 9: 更新 setup-scheduler.sh — 只保留 3 个 job，target 改为 Backend

**Files:**
- Modify: `scripts/setup-scheduler.sh`

- [ ] **Step 1: 重写 setup-scheduler.sh**

```bash
#!/usr/bin/env bash
# ==============================================================================
# Cloud Scheduler Setup — Baby Kingdom Admin
# Creates 3 cron jobs that trigger the Backend HTTP service.
# Run after deploying bk-backend to Cloud Run.
# Usage: ./scripts/setup-scheduler.sh <PROJECT_ID> <BACKEND_URL>
# ==============================================================================
set -euo pipefail

PROJECT_ID="${1:?用法: $0 <PROJECT_ID> <BACKEND_URL>}"
BACKEND_URL="${2:?用法: $0 <PROJECT_ID> <BACKEND_URL>}"
REGION="asia-east1"
SCHEDULER_SA="bk-scheduler-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Setting project: ${PROJECT_ID} ==="
gcloud config set project "${PROJECT_ID}"

# Grant scheduler SA permission to invoke backend Cloud Run
echo "=== Granting invoker role to scheduler SA ==="
gcloud run services add-iam-policy-binding bk-backend \
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/setup-scheduler.sh
git commit -m "chore: setup-scheduler 只保留 3 个 job，target 改为 Backend URL"
```

---

### Task 10: 更新费用分析文档

**Files:**
- Modify: `doc/gcp-cost-analysis.md`

- [ ] **Step 1: 更新文档**

主要改动：
1. 架构描述更新：去掉 Worker，说明 tasks 合并到 Backend
2. 费用表删除 `Cloud Run (Worker)` 行
3. Cloud Scheduler 从 6 jobs 改为 3 jobs（$0.30）
4. 合计费用调低 $1-3
5. 免费额度中 Cloud Scheduler 更新为 3 jobs（全部免费）

- [ ] **Step 2: Commit**

```bash
git add doc/gcp-cost-analysis.md
git commit -m "docs: 更新费用分析，反映 Worker 合并后的架构"
```

---

### Task 11: 构建验证

- [ ] **Step 1: 验证 TypeScript 编译通过**

```bash
cd backend && npm run build
```

Expected: 编译成功，无错误

- [ ] **Step 2: 验证测试通过**

```bash
cd backend && npm test
```

Expected: 所有测试通过（测试不直接依赖 worker-http.ts 或 worker.ts）

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "chore: 构建验证通过，Worker 合并完成"
```
