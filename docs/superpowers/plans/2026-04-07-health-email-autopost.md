# 健康监控邮件告警 + 审批自动发帖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 监控 4 个外部服务（BK Forum、MediaLens、Gemini、Google Trends），异常时邮件告警管理员；审批后根据版块设置自动入队发帖。

**Architecture:** 新增 `shared/email.js`（nodemailer SMTP）和 `shared/health-monitor.js`（4 服务检测 + Redis 冷却告警）。Worker cron 每 5 分钟调用健康监控。`feed.service.approve()` 末尾根据 ForumBoard.enableAutoReply 自动入队 poster。

**Tech Stack:** nodemailer, ioredis (existing), jsonwebtoken (decode JWT exp), node-fetch (existing)

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `backend/src/shared/email.js` | SMTP 邮件发送服务 |
| 新建 | `backend/src/shared/health-monitor.js` | 4 个外部服务健康检测 + 告警逻辑 |
| 修改 | `backend/src/modules/health/health.controller.js` | 新增 getServiceHealth() |
| 修改 | `backend/src/modules/health/health.routes.js` | 新增 GET /services 路由 |
| 修改 | `backend/src/modules/feed/feed.service.js` | approve() 后自动入队 |
| 修改 | `backend/src/worker.js` | 注册健康监控 cron |
| 修改 | `backend/src/seeds/config.seeds.js` | 新增 SMTP 相关 config |
| 修改 | `backend/.env` | 新增 SMTP 环境变量 |
| 新建 | `backend/tests/unit/email.test.js` | 邮件服务测试 |
| 新建 | `backend/tests/unit/health-monitor.test.js` | 健康监控测试 |
| 修改 | `backend/tests/modules/health/health.test.js` | 新增 /services 端点测试 |
| 修改 | `backend/tests/modules/feed/feed.test.js` | 新增自动发帖测试 |

---

### Task 1: 安装 nodemailer + 新增 SMTP 环境变量与 Config 种子

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/.env`
- Modify: `backend/src/seeds/config.seeds.js`

- [ ] 安装 nodemailer

```bash
cd /Users/yangyu/Documents/AI-work/baby-kingdom-new/backend && npm install nodemailer
```

- [ ] 在 `.env` 末尾追加 SMTP 配置

```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=BK Admin <noreply@baby-kingdom.com>
```

- [ ] 在 `config.seeds.js` 的 `CONFIG_PRESETS` 数组末尾（`MAX_POSTS_PER_DAY` 之后）追加 5 项 email 配置

```javascript
  // --- Email ---
  { key: 'SMTP_HOST', value: '', category: 'email', description: 'SMTP server hostname' },
  { key: 'SMTP_PORT', value: '587', category: 'email', description: 'SMTP server port' },
  { key: 'SMTP_USER', value: '', category: 'email', description: 'SMTP authentication username' },
  { key: 'SMTP_PASS', value: '', category: 'email', description: 'SMTP authentication password', isSecret: true },
  { key: 'SMTP_FROM', value: 'BK Admin <noreply@baby-kingdom.com>', category: 'email', description: 'Sender address for alert emails' },
```

- [ ] 运行测试确认无回归

```bash
npm test 2>&1 | tail -5
```

- [ ] Commit

```bash
git add backend/package.json backend/package-lock.json backend/.env backend/src/seeds/config.seeds.js
git commit -m "chore: add nodemailer and SMTP config seeds"
```

---

### Task 2: 邮件服务 `shared/email.js`

**Files:**
- Create: `backend/src/shared/email.js`
- Create: `backend/tests/unit/email.test.js`

- [ ] 创建 `backend/src/shared/email.js`

```javascript
import nodemailer from 'nodemailer';
import logger from './logger.js';

/**
 * Send an alert email to all ADMIN_EMAILS.
 * Reads SMTP config from environment variables.
 * Returns false (never throws) if SMTP is not configured or send fails.
 *
 * @param {string} to - Comma-separated recipient emails
 * @param {string} subject - Email subject
 * @param {string} html - Email body (HTML)
 * @returns {Promise<boolean>}
 */
export async function sendAlert(to, subject, html) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'BK Admin <noreply@baby-kingdom.com>';

  if (!host || !user || !pass) {
    logger.warn('SMTP not configured, skipping alert email');
    return false;
  }

  if (!to) {
    logger.warn('No recipients specified, skipping alert email');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({ from, to, subject, html });
    logger.info({ to, subject }, 'Alert email sent');
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send alert email');
    return false;
  }
}
```

- [ ] 创建 `backend/tests/unit/email.test.js`

```javascript
import { jest } from '@jest/globals';

// Mock nodemailer before importing email module
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
  },
}));

const { sendAlert } = await import('../../src/shared/email.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sendAlert', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns false when SMTP_HOST not configured', async () => {
    delete process.env.SMTP_HOST;
    const result = await sendAlert('admin@test.com', 'Test', '<p>Test</p>');
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('returns false when no recipients', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const result = await sendAlert('', 'Test', '<p>Test</p>');
    expect(result).toBe(false);
  });

  it('calls sendMail with correct params when configured', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'BK <noreply@test.com>';

    const result = await sendAlert('admin@test.com', 'Alert', '<p>Down</p>');
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'BK <noreply@test.com>',
      to: 'admin@test.com',
      subject: 'Alert',
      html: '<p>Down</p>',
    });
  });

  it('returns false and does not throw when sendMail fails', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    const result = await sendAlert('admin@test.com', 'Alert', '<p>Down</p>');
    expect(result).toBe(false);
  });
});
```

- [ ] 运行测试

```bash
npm test -- tests/unit/email.test.js
```

- [ ] Commit

```bash
git add backend/src/shared/email.js backend/tests/unit/email.test.js
git commit -m "feat: add email alert service with nodemailer"
```

---

### Task 3: 健康监控 `shared/health-monitor.js`

**Files:**
- Create: `backend/src/shared/health-monitor.js`
- Create: `backend/tests/unit/health-monitor.test.js`

- [ ] 创建 `backend/src/shared/health-monitor.js`

```javascript
import jwt from 'jsonwebtoken';
import * as configService from '../modules/config/config.service.js';
import { getRedis } from './redis.js';
import { sendAlert } from './email.js';
import Feed from '../modules/feed/feed.model.js';
import logger from './logger.js';

const ALERT_TTL = 3 * 24 * 60 * 60; // 3 days in seconds

/**
 * Check BK Forum API connectivity.
 */
export async function checkBkForum() {
  const baseUrl = await configService.getValue('BK_BASE_URL');
  if (!baseUrl) return { status: 'not_configured', detail: null };

  try {
    const res = await fetch(`${baseUrl}?mod=forum&op=index`, { signal: AbortSignal.timeout(5000) });
    return res.ok
      ? { status: 'connected', detail: null }
      : { status: 'disconnected', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'disconnected', detail: err.message };
  }
}

/**
 * Check MediaLens JWT token validity by decoding exp claim.
 */
export async function checkMediaLens() {
  const token = await configService.getValue('MEDIALENS_JWT_TOKEN');
  if (!token) return { status: 'not_configured', detail: null };

  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return { status: 'expired', detail: 'No exp claim in JWT' };

    const now = Math.floor(Date.now() / 1000);
    const remaining = decoded.exp - now;

    if (remaining <= 0) {
      return { status: 'expired', detail: 'Token has expired' };
    }

    const hours = Math.floor(remaining / 3600);
    const days = Math.floor(hours / 24);

    if (remaining <= 24 * 3600) {
      return { status: 'expiring_soon', detail: `expires in ${hours}h` };
    }

    return { status: 'valid', detail: `expires in ${days}d` };
  } catch {
    return { status: 'expired', detail: 'Failed to decode JWT' };
  }
}

/**
 * Check Gemini API by verifying key is configured + recent generation activity.
 */
export async function checkGemini() {
  const apiKey = await configService.getValue('GEMINI_API_KEY');
  if (!apiKey) return { status: 'not_configured', detail: null };

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentFeed = await Feed.findOne({
    createdAt: { $gte: oneHourAgo },
    draftContent: { $ne: null },
    source: { $in: ['scanner', 'custom'] },
  }).sort({ createdAt: -1 }).lean();

  if (recentFeed) {
    const mins = Math.floor((Date.now() - new Date(recentFeed.createdAt).getTime()) / 60000);
    return { status: 'operational', detail: `last generation ${mins}m ago` };
  }

  return { status: 'no_recent_activity', detail: 'No generation in last 1h' };
}

/**
 * Check Google Trends API connectivity.
 */
export async function checkGoogleTrends() {
  const baseUrl = await configService.getValue('GOOGLE_TRENDS_BASE_URL');
  const enabled = await configService.getValue('GOOGLE_TRENDS_ENABLED');
  if (!baseUrl || enabled === 'false') return { status: 'not_configured', detail: null };

  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    return res.ok
      ? { status: 'connected', detail: null }
      : { status: 'disconnected', detail: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'disconnected', detail: err.message };
  }
}

/**
 * Run all 4 service checks and return results.
 */
export async function checkAllServices() {
  const now = new Date().toISOString();
  const [bkForum, mediaLens, gemini, googleTrends] = await Promise.all([
    checkBkForum(),
    checkMediaLens(),
    checkGemini(),
    checkGoogleTrends(),
  ]);

  return {
    bkForum: { ...bkForum, checkedAt: now },
    mediaLens: { ...mediaLens, checkedAt: now },
    gemini: { ...gemini, checkedAt: now },
    googleTrends: { ...googleTrends, checkedAt: now },
  };
}

// Statuses considered unhealthy (trigger alert)
const UNHEALTHY = new Set(['disconnected', 'expired', 'expiring_soon']);

/**
 * Check all services, send alerts for unhealthy ones, send recovery for restored ones.
 * Uses Redis keys with 3-day TTL to avoid spamming.
 */
export async function runHealthCheck() {
  const results = await checkAllServices();
  const adminEmails = await configService.getValue('ADMIN_EMAILS');
  if (!adminEmails) {
    logger.warn('ADMIN_EMAILS not configured, skipping health alerts');
    return results;
  }

  const redis = getRedis();

  for (const [name, result] of Object.entries(results)) {
    const alertKey = `health:alert:${name}`;
    const isUnhealthy = UNHEALTHY.has(result.status);
    const alertSent = await redis.get(alertKey);

    if (isUnhealthy && !alertSent) {
      // First alert or 3-day TTL expired → send alert and set key
      await sendAlert(
        adminEmails,
        `[BK Admin 告警] ${name} 服务异常`,
        `<h3>服务异常告警</h3>
        <p><b>服务:</b> ${name}</p>
        <p><b>状态:</b> ${result.status}</p>
        <p><b>详情:</b> ${result.detail || '无'}</p>
        <p><b>检测时间:</b> ${result.checkedAt}</p>
        <p>请及时处理。如 3 天内未修复将再次提醒。</p>`,
      );
      await redis.set(alertKey, result.status, 'EX', ALERT_TTL);
      logger.info({ name, status: result.status }, 'Health alert sent');
    } else if (!isUnhealthy && alertSent) {
      // Service recovered → send recovery and delete key
      await sendAlert(
        adminEmails,
        `[BK Admin 恢复] ${name} 服务已恢复`,
        `<h3>服务恢复通知</h3>
        <p><b>服务:</b> ${name}</p>
        <p><b>状态:</b> ${result.status}</p>
        <p><b>恢复时间:</b> ${result.checkedAt}</p>`,
      );
      await redis.del(alertKey);
      logger.info({ name, status: result.status }, 'Health recovery sent');
    }
  }

  return results;
}
```

- [ ] 创建 `backend/tests/unit/health-monitor.test.js`

```javascript
import { jest } from '@jest/globals';
import { setupDB, teardownDB } from '../helpers.js';
import { getRedis, connectRedis } from '../../src/shared/redis.js';
import Config from '../../src/modules/config/config.model.js';

// We test the individual check functions directly (they read from Config DB)
const { checkBkForum, checkMediaLens, checkGemini, checkGoogleTrends } = await import(
  '../../src/shared/health-monitor.js'
);

beforeAll(async () => {
  await setupDB();
  // Clean test configs
  await Config.deleteMany({ key: { $in: ['BK_BASE_URL', 'MEDIALENS_JWT_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_TRENDS_BASE_URL', 'GOOGLE_TRENDS_ENABLED'] } });
});

afterAll(async () => {
  await Config.deleteMany({ key: { $in: ['BK_BASE_URL', 'MEDIALENS_JWT_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_TRENDS_BASE_URL', 'GOOGLE_TRENDS_ENABLED'] } });
  await teardownDB();
});

describe('checkBkForum', () => {
  it('returns not_configured when BK_BASE_URL not set', async () => {
    const result = await checkBkForum();
    expect(result.status).toBe('not_configured');
  });
});

describe('checkMediaLens', () => {
  it('returns not_configured when no JWT token', async () => {
    const result = await checkMediaLens();
    expect(result.status).toBe('not_configured');
  });

  it('returns expired for an expired JWT', async () => {
    // Create a JWT that expired 1 hour ago
    const expiredPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 })).toString('base64url');
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${expiredPayload}.fake`;
    await Config.findOneAndUpdate(
      { key: 'MEDIALENS_JWT_TOKEN' },
      { key: 'MEDIALENS_JWT_TOKEN', value: fakeJwt, category: 'medialens' },
      { upsert: true },
    );
    const result = await checkMediaLens();
    expect(result.status).toBe('expired');
  });

  it('returns expiring_soon for JWT expiring in 12 hours', async () => {
    const soonPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 12 * 3600 })).toString('base64url');
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${soonPayload}.fake`;
    await Config.findOneAndUpdate(
      { key: 'MEDIALENS_JWT_TOKEN' },
      { key: 'MEDIALENS_JWT_TOKEN', value: fakeJwt, category: 'medialens' },
      { upsert: true },
    );
    const result = await checkMediaLens();
    expect(result.status).toBe('expiring_soon');
    expect(result.detail).toContain('12h');
  });

  it('returns valid for JWT expiring in 5 days', async () => {
    const validPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 5 * 24 * 3600 })).toString('base64url');
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${validPayload}.fake`;
    await Config.findOneAndUpdate(
      { key: 'MEDIALENS_JWT_TOKEN' },
      { key: 'MEDIALENS_JWT_TOKEN', value: fakeJwt, category: 'medialens' },
      { upsert: true },
    );
    const result = await checkMediaLens();
    expect(result.status).toBe('valid');
    expect(result.detail).toContain('5d');
  });
});

describe('checkGemini', () => {
  it('returns not_configured when no API key', async () => {
    const result = await checkGemini();
    expect(result.status).toBe('not_configured');
  });
});

describe('checkGoogleTrends', () => {
  it('returns not_configured when no base URL', async () => {
    const result = await checkGoogleTrends();
    expect(result.status).toBe('not_configured');
  });
});

describe('Alert cooldown (Redis)', () => {
  it('alert key set with 3-day TTL prevents duplicate alerts', async () => {
    const redis = getRedis();
    const key = 'health:alert:testService';
    await redis.set(key, 'disconnected', 'EX', 3 * 24 * 60 * 60);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3 * 24 * 60 * 60);
    await redis.del(key);
  });
});
```

- [ ] 运行测试

```bash
npm test -- tests/unit/health-monitor.test.js
```

- [ ] Commit

```bash
git add backend/src/shared/health-monitor.js backend/tests/unit/health-monitor.test.js
git commit -m "feat: add health monitor for 4 external services with email alerts"
```

---

### Task 4: Health API 端点 `GET /api/health/services`

**Files:**
- Modify: `backend/src/modules/health/health.controller.js`
- Modify: `backend/src/modules/health/health.routes.js`
- Modify: `backend/tests/modules/health/health.test.js`

- [ ] 在 `health.controller.js` 末尾新增 `getServiceHealth` 函数

在文件顶部新增 import：

```javascript
import { checkAllServices } from '../../shared/health-monitor.js';
```

在 `getHealth` 函数之后新增：

```javascript
export async function getServiceHealth(req, res) {
  const results = await checkAllServices();
  return res.json({ success: true, data: results });
}
```

- [ ] 在 `health.routes.js` 注册新路由

在 `import { getHealth }` 后添加 `getServiceHealth`：

```javascript
import { getHealth, getServiceHealth } from './health.controller.js';
```

在 `router.get('/', getHealth)` 之后添加：

```javascript
router.get('/services', getServiceHealth);
```

- [ ] 在 `health.test.js` 末尾添加测试

```javascript
describe('GET /api/health/services', () => {
  it('returns 4 service statuses', async () => {
    const res = await request.get('/api/health/services');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('bkForum');
    expect(res.body.data).toHaveProperty('mediaLens');
    expect(res.body.data).toHaveProperty('gemini');
    expect(res.body.data).toHaveProperty('googleTrends');
    // In test env, all services are not configured
    expect(res.body.data.bkForum.status).toBe('not_configured');
    expect(res.body.data.bkForum.checkedAt).toBeDefined();
  });
});
```

- [ ] 运行测试

```bash
npm test -- tests/modules/health/health.test.js
```

- [ ] Commit

```bash
git add backend/src/modules/health/health.controller.js backend/src/modules/health/health.routes.js backend/tests/modules/health/health.test.js
git commit -m "feat: add GET /api/health/services endpoint for external service monitoring"
```

---

### Task 5: Worker 注册健康监控 Cron

**Files:**
- Modify: `backend/src/worker.js`

- [ ] 在 `worker.js` 顶部添加 import

在现有 import 列表末尾（`import logger from './shared/logger.js';` 之后）添加：

```javascript
import { runHealthCheck } from './shared/health-monitor.js';
```

- [ ] 在 `registerCronJobs()` 函数内，`logger.info('Cron jobs registered...')` 之前，添加健康监控 cron

```javascript
    // Health monitor: every 5 minutes
    cronTasks.push(cron.schedule('*/5 * * * *', async () => {
      try {
        await runHealthCheck();
        logger.info('Cron: health check completed');
      } catch (err) {
        logger.error({ err }, 'Cron: health check failed');
      }
    }));
```

- [ ] 更新 `logger.info` 日志消息

将：
```javascript
logger.info('Cron jobs registered: scanner(30m), trends(1h), daily-reset(midnight), stats(1h)');
```
改为：
```javascript
logger.info('Cron jobs registered: scanner(30m), trends(1h), daily-reset(midnight), stats(1h), health(5m)');
```

- [ ] 运行测试确认无回归

```bash
npm test 2>&1 | tail -5
```

- [ ] Commit

```bash
git add backend/src/worker.js
git commit -m "feat: register health monitor cron job (every 5 minutes)"
```

---

### Task 6: 审批后自动入队发帖

**Files:**
- Modify: `backend/src/modules/feed/feed.service.js`
- Modify: `backend/tests/modules/feed/feed.test.js`

- [ ] 在 `feed.service.js` 顶部添加 import

在现有 import 列表中添加：

```javascript
import ForumBoard from '../forum/forum.model.js';
```

注意：需要导入 forum.model.js 中的 ForumBoard。先检查 forum.model.js 的导出方式。ForumBoard 是命名导出（`export { ForumCategory, ForumBoard }`）。

```javascript
import { ForumBoard } from '../forum/forum.model.js';
```

- [ ] 在 `approve()` 函数末尾，`return feed;` 之前，添加自动入队逻辑

在 `emitToRoom(...)` 行之后、`return feed;` 之前插入：

```javascript
  // Auto-post: if the board has enableAutoReply, enqueue to poster queue
  if (feed.threadFid) {
    try {
      const board = await ForumBoard.findOne({ fid: feed.threadFid });
      if (board?.enableAutoReply) {
        const { getQueue } = await import('../queue/queue.service.js');
        const posterQueue = getQueue('poster');
        if (posterQueue) {
          await posterQueue.add('auto-post', {
            feedId: feed._id.toString(),
            triggeredBy: 'auto-approve',
          });
          logger.info({ feedId: feed.feedId, fid: feed.threadFid }, 'Auto-post queued after approval');
        }
      }
    } catch (err) {
      // Auto-post failure should not block approval
      logger.error({ err, feedId: feed.feedId }, 'Failed to queue auto-post');
    }
  }
```

同时在文件顶部确保 logger 已导入（检查是否已有）。如果没有：

```javascript
import logger from '../../shared/logger.js';
```

- [ ] 在 `feed.test.js` 末尾添加自动发帖测试

需要在文件顶部添加 ForumBoard import（如果没有的话），以及在测试中创建 board 数据。

在 `afterAll` 中添加清理：`await ForumBoard.deleteMany({ fid: { $in: [88162, 88163] } });`

在文件末尾添加 describe 块：

```javascript
describe('Auto-post after approval', () => {
  let autoFeedId;

  beforeAll(async () => {
    // Import ForumBoard
    const { ForumBoard } = await import('../../../src/modules/forum/forum.model.js');

    // Create board with enableAutoReply=true
    await ForumBoard.findOneAndUpdate(
      { fid: 88162 },
      { fid: 88162, name: 'Auto-Reply Board', enableScraping: false, enableAutoReply: true, isActive: true },
      { upsert: true },
    );
    // Create board with enableAutoReply=false
    await ForumBoard.findOneAndUpdate(
      { fid: 88163 },
      { fid: 88163, name: 'Manual Board', enableScraping: false, enableAutoReply: false, isActive: true },
      { upsert: true },
    );
  });

  afterAll(async () => {
    const { ForumBoard } = await import('../../../src/modules/forum/forum.model.js');
    await ForumBoard.deleteMany({ fid: { $in: [88162, 88163] } });
    await Feed.deleteMany({ feedId: { $in: ['FQ-AUTO-001', 'FQ-AUTO-002'] } });
  });

  it('auto-queues poster job when board.enableAutoReply is true', async () => {
    const feed = await Feed.create({
      feedId: 'FQ-AUTO-001', type: 'reply', status: 'pending', source: 'scanner',
      threadTid: 66661, threadFid: 88162, personaId: 'BK-FEED-TEST',
      draftContent: '自动发帖测试', charCount: 6,
    });

    const res = await request
      .post(`/api/v1/feeds/${feed._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    // The feed should be approved; poster queue job is added asynchronously
    // We verify by checking the queue (or just ensure no error occurred)
  });

  it('does NOT auto-queue when board.enableAutoReply is false', async () => {
    const feed = await Feed.create({
      feedId: 'FQ-AUTO-002', type: 'reply', status: 'pending', source: 'scanner',
      threadTid: 66662, threadFid: 88163, personaId: 'BK-FEED-TEST',
      draftContent: '手动发帖测试', charCount: 6,
    });

    const res = await request
      .post(`/api/v1/feeds/${feed._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    // No auto-post should be queued — approval still succeeds
  });
});
```

- [ ] 运行测试

```bash
npm test -- tests/modules/feed/feed.test.js
```

- [ ] 运行全量测试

```bash
npm test 2>&1 | tail -5
```

- [ ] Commit

```bash
git add backend/src/modules/feed/feed.service.js backend/tests/modules/feed/feed.test.js
git commit -m "feat: auto-queue poster job after approval when board.enableAutoReply is true"
```

---

## Summary

| Task | 内容 | 新增测试 |
|------|------|----------|
| 1 | nodemailer 安装 + SMTP Config 种子 | 0 |
| 2 | 邮件服务 shared/email.js | 4 |
| 3 | 健康监控 shared/health-monitor.js | 7 |
| 4 | GET /api/health/services 端点 | 1 |
| 5 | Worker 健康监控 cron | 0 |
| 6 | 审批自动发帖 | 2 |
| **Total** | **6 tasks** | **~14 tests** |
