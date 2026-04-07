# BK Admin 系统痛点分析与解决状态

> 本文档记录旧系统（Google Apps Script）的核心痛点，基于代码审计评估新系统（Vue 3 + Express + MongoDB）的实际解决状态，并标注仍需完善的部分。

---

## 总览

| # | 痛点 | 状态 | 说明 |
|---|------|------|------|
| 1 | MediaLens 登录过期无法自动抓取热话 | ⚠️ 部分解决 | 有 OTP 流程和 cron 定时抓取，但 Token 过期后静默降级，无自动重新认证 |
| 2 | 无法针对论坛模块设置人设与语气模式 | ✅ 已解决 | 版块级人设绑定 + 语气优先级链完整实现 |
| 3 | 无法监控抓取与审批流程 | ⚠️ 部分解决 | Feed 审批有完整 WebSocket 实时推送，但 Scanner 扫描过程无实时通知 |
| 4 | 无法自动回复帖子需要人工审核 | ⚠️ 部分解决 | 发帖流水线完整，但仍需人工审批后才能发帖，未实现全自动 |
| 5 | 无法监控抓取最新热话的记录 | ✅ 已解决 | Trends 持久化 + 分页查询 + 使用状态追踪 |
| 6 | 无法批量审批回复 | ✅ 已解决 | 批量审批/拒绝 + 50 条上限 + 部分失败不阻塞 |
| 7 | 没有仪表盘统计分析，系统健康状态监控 | ⚠️ 部分解决 | Dashboard 统计完整，健康检查端点存在，但**健康异常时无邮件告警** |

---

## 1. MediaLens 登录过期后，无法自动抓取最新热门话题

**痛点：** MediaLens OTP 登录态过期后，热话抓取静默失败，运营人员无法及时发现，导致内容断供。

### 已实现

- **OTP 认证流程**（`trends.service.js`）：`requestOtp()` 发送验证码、`verifyOtp()` 验证并存储 JWT Token 到 Config
- **定时抓取**（`worker.js`）：每小时 cron 触发 `pullTrends()`，通过 BullMQ 队列执行
- **Token 缓存**：JWT 存储在 MongoDB Config 集合中，跨进程共享

### 未解决

- **Token 过期静默降级**：当 MediaLens 返回 401 时，`fetchFromSource()` 仅打印 `logger.warn('MediaLens JWT expired, needs reauthentication')` 后返回空数组，不会触发任何告警或重试
- **无自动重新认证**：OTP 本身无法自动化（需要人工接收邮件验证码），但系统未在检测到过期时主动通知管理员
- **无重试机制**：抓取失败后不会重试，只能等待下一次 cron 周期（1 小时后）

### 待改进

1. Token 过期时，通过邮件/WebSocket 通知管理员需要重新认证
2. 在 Dashboard 显示 MediaLens Token 状态（有效/过期/未配置）
3. 连续 N 次抓取为空时触发告警

---

## 2. 无法针对论坛模块设置人设与语气模式

**痛点：** 旧系统人设和语气硬编码，无法灵活配置不同版块的回复风格，导致回复内容千篇一律。

### 已实现 ✅

- **版块级人设绑定**（`forum.model.js`）：`ForumBoard.personaBindings` 数组支持每个版块绑定多个人设，每个绑定可设置 `toneMode`、`weight`（high/medium/low）、`dailyLimit`
- **智能人设选取**（`scanner.service.js` → `selectPersona()`）：优先从版块绑定池中选取，过滤每日上限和话题黑名单，无绑定时回退到全局活跃人设
- **语气优先级链**（`prompt.builder.js` → `resolveToneMode()`）：
  - Tier3 强制覆盖 → 负面情感阈值触发 → TopicRule 规则指定 → 人设主语气 → 默认值
- **完整 CRUD 管理**：Persona（14 字段）、ToneMode（11 字段）、TopicRule（10 字段）均有前端表单和 API
- **版块独立配置**：每个 ForumBoard 可设置 `defaultToneMode`、`sensitivityTier`、`replyThreshold`

---

## 3. 无法监控抓取与审批流程

**痛点：** 抓取和审批过程是黑盒，运营无法知道当前有多少待审帖子、审批进度如何。

### 已实现

- **Feed 状态流转**：pending → approved/rejected → posted/failed，完整生命周期
- **Claim 机制**：编辑认领后 10 分钟过期自动释放，防止重复操作
- **Feed 实时推送**（`feed.service.js`）：4 个 WebSocket 事件
  - `feed:claimed` — 认领时广播
  - `feed:unclaimed` — 释放时广播
  - `feed:statusChanged` — 审批/拒绝时广播（含 feedId + status）
- **Audit 日志**：所有操作记录（FEED_APPROVED、FEED_REJECTED、FEED_POSTED、SCAN_COMPLETE 等），90 天 TTL
- **Queue 管理界面**：5 个队列的状态监控、暂停/恢复控制

### 未解决

- **Scanner 无实时推送**：`scanner.service.js` 中没有 `emitToRoom()` 调用，扫描过程和结果不会通过 WebSocket 推送到前端。虽然 `socket/listeners.js` 定义了 `scanner:result` 事件，但后端 Scanner 服务未发射该事件
- **前端 listeners.js 定义但后端未发射的事件**：`scanner:result`、`feed:new` — 这两个事件在前端有监听逻辑，但后端服务代码中未找到对应的 emit

### 待改进

1. Scanner 扫描完成后发射 `scanner:result` 事件（含 scanned/hits/feeds 统计）
2. Feed 创建时发射 `feed:new` 事件
3. Scanner 页面添加实时进度指示器

---

## 4. 无法自动回复帖子，需要人工审核

**痛点：** 旧系统需要人工逐条复制回复内容到论坛发帖，效率极低且容易出错。

### 已实现

- **AI 自动生成**：Scanner 自动扫描低回复帖子，Gemini 两步评估（低成本筛选 → 完整生成），节省 ~93% Token
- **7 层过滤 + 2 熔断器**：队列满/超时自动停止，前 4 层不消耗 Token
- **Quality Guard**：7 种 AI 痕迹检测、重复内容检查、长度校验
- **自动发帖流水线**（`poster.service.js`）：完整实现 BK 登录 → 预检 → 限频 → 发帖 → 重试（最多 2 次，32s 间隔）
- **BullMQ 队列管理**：concurrency:1 + 35s limiter，幂等性检查（已发帖跳过）
- **Mock 模式**：无需真实论坛即可测试全流程

### 未解决

- **仍需人工审批**：`postFeed()` 要求 `feed.status === 'approved'`，即必须管理员手动审批后才能发帖。系统没有"自动审批"或"自动发帖"模式
- **审批到发帖未自动衔接**：管理员审批后，需要额外操作触发发帖（手动调用 poster 或通过队列），未实现"审批即发帖"的自动流程

### 待改进

1. 可选的"自动发帖"模式：Quality Guard 检查通过且无 warning 的 Feed 自动进入发帖队列（通过 Config 开关控制）
2. 审批后自动入队：`approve()` 成功后自动向 poster 队列添加 job
3. 高信任人设可配置"免审直发"

---

## 5. 无法监控抓取最新热话的记录

**痛点：** 热话抓取没有历史记录，无法追溯哪些热话被抓取、何时抓取、是否成功。

### 已实现 ✅

- **Trend 持久化**（`trends.model.js`）：每条热话存储 `topicLabel`、`source`（MediaLens/GoogleTrends）、`sentiment`、`engagement`、`pullId`（批次标识）、`createdAt`
- **使用状态追踪**：`isUsed`、`usedAt`、`feedIds[]` 记录该热话产生了哪些 Feed
- **分页查询 API**（`GET /api/v1/trends`）：支持按来源筛选、分页、排序
- **去重机制**：`source + topicLabel` 唯一索引，同一热话不会重复入库
- **Scanner History**（`GET /api/v1/scanner/history`）：扫描历史分页查看
- **前端展示**：Trends 页面列表 + Scanner 页面统计

---

## 6. 无法批量审批回复

**痛点：** 旧系统只能逐条审批，面对大量待审帖子时效率极低。

### 已实现 ✅

- **批量审批**（`POST /feeds/batch/approve`）：一次最多 50 条，返回 `{succeeded: [], failed: []}` 数组
- **批量拒绝**（`POST /feeds/batch/reject`）：支持附加批量备注 `notes`
- **部分失败不阻塞**：逐条调用 `approve()`/`reject()`，单条失败记录原因，不影响其他条目
- **安全限制**：超过 50 条返回 422 ValidationError
- **权限控制**：仅 admin/editor 可操作
- **审计日志**：每条操作独立记录 Audit 事件
- **前端支持**：表格多选 + 批量操作按钮

---

## 7. 没有仪表盘统计分析，系统健康状态监控

**痛点：** 旧系统无法直观了解运营数据和系统健康状况，决策缺乏数据支撑。

### 已实现

- **Dashboard 统计**（`dashboard.service.js`）：
  - 实时数据：待审数量、队列状态（`GET /dashboard/realtime`）
  - 今日统计：生成/审批/拒绝/发帖/失败数量、审批率（`GET /dashboard/today`）
  - 近期动态：最近 20 条 Feed + 10 条队列任务（`GET /dashboard/recent`）
  - 周报趋势：7 天 DailyStats 折线数据（`GET /dashboard/weekly`）
- **DailyStats 模型**：10+ 维度聚合（scanner/feeds/trends/posts/byBoard/byPersona/gemini/quality）
- **每小时自动聚合**：Worker cron `'5 * * * *'` 触发 `aggregateDailyStats()`
- **Health Check 端点**（`GET /api/health`）：
  - 检测 MongoDB + Redis 连接状态
  - 返回 uptime、timestamp
  - 异常时返回 503 + `status: 'degraded'`
- **Docker 健康检查**：backend 检查 HTTP、worker 检查 Redis 连通性

### 未解决

- **❌ 健康异常时无邮件告警**：Health Check 只返回 HTTP 状态码，异常时无任何主动通知。管理员必须主动轮询 `/api/health` 或查看 Docker 状态才能发现问题
- **❌ 无邮件服务**：整个系统未集成任何邮件发送能力（无 nodemailer、无 SMTP 配置、无邮件队列）
- **❌ Config 中 ADMIN_EMAILS 未使用**：种子数据有 `ADMIN_EMAILS: 'admin@presslogic.com'` 但未被任何服务引用

### 待实现：健康异常邮件告警

**需求：** 系统健康状态失败时，自动向 admin 配置的邮箱发送告警邮件。

**实现方案：**

1. **新增邮件服务**（`backend/src/shared/email.js`）
   - 集成 nodemailer，支持 SMTP 配置
   - 导出 `sendAlertEmail(to, subject, body)` 函数
   - 环境变量：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`

2. **新增健康监控 Worker**（在 `worker.js` 中添加 cron）
   - 每 5 分钟执行健康检查（检测 MongoDB + Redis）
   - 异常时读取 `configService.getValue('ADMIN_EMAILS')` 获取收件人
   - 发送告警邮件，包含：故障服务、检测时间、连续失败次数
   - **防刷机制**：同一故障 30 分钟内只发一次邮件（Redis 锁）

3. **新增 Config 项**
   - `HEALTH_CHECK_INTERVAL_MINUTES`：检查间隔（默认 5）
   - `HEALTH_ALERT_COOLDOWN_MINUTES`：告警冷却时间（默认 30）
   - `HEALTH_ALERT_ENABLED`：告警开关（默认 true）

4. **恢复通知**：服务恢复正常后发送恢复邮件

---

## 改进优先级

| 优先级 | 项目 | 影响 |
|--------|------|------|
| **P0** | 健康异常邮件告警 | 系统宕机无人知晓 |
| **P0** | MediaLens Token 过期通知 | 热话断供无人发现 |
| **P1** | Scanner WebSocket 事件补全 | 前端监听已就绪但后端未发射 |
| **P1** | 审批后自动入队发帖 | 减少人工操作步骤 |
| **P2** | Feed 创建时发射 feed:new 事件 | 完善实时通知链路 |
| **P2** | 可选的免审直发模式 | 高信任人设自动化 |
