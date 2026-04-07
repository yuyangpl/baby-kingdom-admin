# 设计文档：健康监控邮件告警 + 审批自动发帖

## 目标

1. 新增邮件服务，支持 SMTP 发送告警邮件
2. 监控 4 个外部服务（BK Forum、MediaLens、Gemini、Google Trends），异常时邮件通知管理员
3. MediaLens JWT 过期/即将过期时邮件通知
4. Feed 审批后根据版块 `enableAutoReply` 设置自动入队发帖

---

## 模块 1：邮件服务

### 文件

- 新建 `backend/src/shared/email.js`

### 接口

```javascript
/**
 * 发送告警邮件给 ADMIN_EMAILS 配置的所有管理员
 * @param {string} subject - 邮件主题
 * @param {string} html - 邮件正文（HTML）
 * @returns {Promise<boolean>} - 是否发送成功
 */
export async function sendAlert(subject, html)
```

### 实现

- 使用 nodemailer，SMTP 配置从环境变量读取：
  - `SMTP_HOST`、`SMTP_PORT`（默认 587）、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`
- 收件人从 `configService.getValue('ADMIN_EMAILS')` 读取，支持逗号分隔多人
- SMTP 未配置时仅 `logger.warn` 并返回 false，不抛异常
- 发送失败仅 log，不影响调用方

### Config 种子新增

| Key | Value | Category | isSecret |
|-----|-------|----------|----------|
| SMTP_HOST | '' | email | false |
| SMTP_PORT | '587' | email | false |
| SMTP_USER | '' | email | false |
| SMTP_PASS | '' | email | true |
| SMTP_FROM | 'BK Admin <noreply@baby-kingdom.com>' | email | false |

### 环境变量（.env）

```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=BK Admin <noreply@baby-kingdom.com>
```

---

## 模块 2：服务健康监控

### 文件

- 新建 `backend/src/shared/health-monitor.js`
- 修改 `backend/src/modules/health/health.controller.js` — 新增 `getServiceHealth()` 接口
- 修改 `backend/src/modules/health/health.routes.js` — 新增路由
- 修改 `backend/src/worker.js` — 注册 cron

### 4 个服务检测逻辑

| 服务 | 检测方式 | 状态值 |
|------|----------|--------|
| BK Forum API | `fetch(BK_BASE_URL + '?mod=forum&op=index')` 5s 超时 | `connected` / `disconnected` / `not_configured` |
| MediaLens JWT | 解码 JWT 的 `exp` 字段，与当前时间比较 | `valid` (>24h) / `expiring_soon` (≤24h) / `expired` / `not_configured` |
| Gemini API | 检查 `GEMINI_API_KEY` 是否已配置 + 查询最近 1 小时内 Feed（source=scanner 或 custom）是否有生成记录（draftContent 非空） | `operational` / `no_recent_activity` / `not_configured` |
| Google Trends | `fetch(GOOGLE_TRENDS_BASE_URL)` 5s 超时 | `connected` / `disconnected` / `not_configured` |

### 检测结果数据结构

```javascript
{
  bkForum:      { status: 'connected', checkedAt: '2026-04-07T10:00:00Z', detail: null },
  mediaLens:    { status: 'valid', checkedAt: '...', detail: 'expires in 5d' },
  gemini:       { status: 'operational', checkedAt: '...', detail: 'last generation 15m ago' },
  googleTrends: { status: 'connected', checkedAt: '...', detail: null },
}
```

### 告警规则

- **触发条件**：服务状态从健康变为异常（`disconnected`、`expired`、`expiring_soon`）
- **首次告警**：检测到异常时立即发送一封告警邮件，同时在 Redis 记录 `health:alert:{serviceName}` + 3 天 TTL
- **重复告警**：3 天后若问题仍未解决（Redis key 过期），再次发送一封告警邮件并重新设置 3 天 TTL
- **恢复通知**：服务从异常恢复为健康时，发送恢复邮件并删除 Redis key
- **MediaLens 特殊处理**：`expiring_soon`（≤24h）时也发告警，提醒管理员提前续期
- **实现**：每次检测时，先检查 Redis key 是否存在。不存在 → 发邮件 + 设 key（3天 TTL）；存在 → 跳过（等 key 过期后自动重发）

### 邮件模板

**告警邮件：**
```
主题: [BK Admin 告警] {serviceName} 服务异常
正文:
服务: {serviceName}
状态: {status}
详情: {detail}
检测时间: {checkedAt}
请及时处理。
```

**恢复邮件：**
```
主题: [BK Admin 恢复] {serviceName} 服务已恢复
正文:
服务: {serviceName}
状态: {status}
恢复时间: {checkedAt}
```

### API 端点

```
GET /api/health/services
```

返回 4 个服务的最新检测结果。无需认证（与现有 `/api/health` 一致）。

### Worker Cron

每 5 分钟运行一次 `checkAllServices()`。不通过 BullMQ 队列，直接在 cron 回调中执行（轻量操作，无需队列调度）。

---

## 模块 3：审批自动发帖

### 文件

- 修改 `backend/src/modules/feed/feed.service.js` — `approve()` 函数末尾添加自动入队逻辑
- 修改 `backend/src/modules/forum/forum.model.js` — 无需修改（`enableAutoReply` 已存在）

### 逻辑

在 `approve()` 函数的末尾，审批成功后：

```javascript
// 审批成功后检查是否自动发帖
if (feed.threadFid) {
  const board = await ForumBoard.findOne({ fid: feed.threadFid });
  if (board?.enableAutoReply) {
    const { getQueue } = await import('../../modules/queue/queue.service.js');
    const posterQueue = getQueue('poster');
    if (posterQueue) {
      await posterQueue.add('auto-post', { feedId: feed._id.toString(), triggeredBy: 'auto-approve' });
    }
  }
}
```

### 行为

- 仅当版块 `enableAutoReply === true` 时自动入队
- 默认所有版块关闭（`enableAutoReply` 默认值为 false，已在 schema 中定义）
- 发帖仍走正常 poster 队列，受 35s 限频和幂等检查保护
- Audit 日志中 `triggeredBy: 'auto-approve'` 区分手动和自动发帖

---

## 测试计划

| # | 测试 | 文件 |
|---|------|------|
| 1 | sendAlert SMTP 未配置时返回 false 不抛异常 | tests/unit/email.test.js |
| 2 | sendAlert 配置完整时调用 nodemailer.sendMail | tests/unit/email.test.js |
| 3 | checkBkForum 无 BK_BASE_URL 返回 not_configured | tests/unit/health-monitor.test.js |
| 4 | checkMediaLens JWT 过期返回 expired | tests/unit/health-monitor.test.js |
| 5 | checkMediaLens JWT 剩余 12h 返回 expiring_soon | tests/unit/health-monitor.test.js |
| 6 | checkGemini 无 API_KEY 返回 not_configured | tests/unit/health-monitor.test.js |
| 7 | 告警冷却：30 分钟内同一服务不重复发邮件 | tests/unit/health-monitor.test.js |
| 8 | approve + enableAutoReply=true 自动入队 | tests/modules/feed/feed.test.js |
| 9 | approve + enableAutoReply=false 不入队 | tests/modules/feed/feed.test.js |
| 10 | GET /api/health/services 返回 4 个服务状态 | tests/modules/health/health.test.js |

---

## 新增依赖

- `nodemailer` — SMTP 邮件发送

## 涉及文件清单

| 操作 | 文件 |
|------|------|
| 新建 | `backend/src/shared/email.js` |
| 新建 | `backend/src/shared/health-monitor.js` |
| 修改 | `backend/src/modules/health/health.controller.js` |
| 修改 | `backend/src/modules/health/health.routes.js` |
| 修改 | `backend/src/modules/feed/feed.service.js` |
| 修改 | `backend/src/worker.js` |
| 修改 | `backend/src/seeds/config.seeds.js` |
| 修改 | `backend/.env` / `.env.development` |
| 新建 | `backend/tests/unit/email.test.js` |
| 新建 | `backend/tests/unit/health-monitor.test.js` |
| 修改 | `backend/tests/modules/feed/feed.test.js` |
| 修改 | `backend/tests/modules/health/health.test.js` |
