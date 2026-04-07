# Baby Kingdom Admin — Data Dictionary

> Auto-generated from Mongoose Schema definitions | 2026-04-07

Database: **MongoDB 7** | ODM: **Mongoose**

---

## Table of Contents

1. [users](#1-users)
2. [configs](#2-configs)
3. [feeds](#3-feeds)
4. [personas](#4-personas)
5. [tonemodes](#5-tonemodes)
6. [topicrules](#6-topicrules)
7. [forumcategories](#7-forumcategories)
8. [forumboards](#8-forumboards)
9. [trends](#9-trends)
10. [queuejobs](#10-queuejobs)
11. [dailystats](#11-dailystats)
12. [auditlogs](#12-auditlogs)

---

## 1. users

**Model:** `User` | **Module:** auth | **Collection:** `users`

管理员用户表，支持 JWT 双 Token 认证。密码 bcrypt 12 轮加密。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `username` | String | Yes | — | unique, trim, 2-50 chars | 用户名 |
| `email` | String | Yes | — | unique, trim, lowercase | 邮箱（登录凭证） |
| `password` | String | Yes | — | min 6 chars, `select: false` | 密码（bcrypt 哈希，查询默认不返回） |
| `role` | String | No | `'viewer'` | enum: `admin`, `editor`, `viewer` | 角色 |
| `lastLoginAt` | Date | No | — | — | 最后登录时间 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

**Hooks:**
- `pre('save')` — 密码变更时自动 bcrypt 加密（12 轮）
- `toJSON()` — 自动移除 password 和 __v

---

## 2. configs

**Model:** `Config` | **Module:** config | **Collection:** `configs`

系统配置表，46 项预置配置。敏感配置 AES 加密存储。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `key` | String | Yes | — | unique, trim | 配置键名 |
| `value` | String | No | `''` | — | 配置值（敏感项 AES 加密） |
| `category` | String | Yes | — | enum: `gemini`, `bk-forum`, `medialens`, `google-trends`, `scanner`, `general` | 配置分类 |
| `description` | String | No | `''` | — | 配置说明 |
| `isSecret` | Boolean | No | `false` | — | 是否敏感配置（AES 加密） |
| `updatedBy` | String | No | — | — | 最后更新人 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

---

## 3. feeds

**Model:** `Feed` | **Module:** feed | **Collection:** `feeds`

AI 生成的回帖/发帖内容，核心业务表。支持审核流程（pending → approved → posted）。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `feedId` | String | Yes | — | unique | 业务唯一 ID |
| `type` | String | No | `'reply'` | enum: `thread`, `reply` | 内容类型 |
| `status` | String | No | `'pending'` | enum: `pending`, `approved`, `rejected`, `posted`, `failed` | 审核状态 |
| `source` | String | Yes | — | enum: `scanner`, `trends`, `custom` | 来源渠道 |
| **--- 帖子信息 ---** |
| `threadTid` | Number | No | — | — | 原帖 TID |
| `threadFid` | Number | No | — | — | 所属版块 FID |
| `threadSubject` | String | No | — | — | 原帖标题 |
| `threadContent` | String | No | — | — | 原帖内容 |
| `subject` | String | No | — | — | 新帖标题（发帖时用） |
| **--- 趋势来源 ---** |
| `trendSource` | String | No | — | — | 趋势来源（viral-topics / lihkg / fb-viral / SCAN / CUSTOM） |
| `trendSentiment` | Number | No | — | — | 趋势情感分数 |
| `trendEngagement` | Number | No | — | — | 趋势互动量 |
| `pullTime` | Date | No | — | — | 趋势拉取时间 |
| **--- 生成内容 ---** |
| `personaId` | String | No | — | — | 使用的人设 ID |
| `bkUsername` | String | No | — | — | BK 论坛用户名 |
| `displayName` | String | No | — | — | 显示名 |
| `archetype` | String | No | — | — | 人设原型 |
| `toneMode` | String | No | — | — | 语气模式 |
| `sensitivityTier` | String | No | — | — | 敏感度层级 |
| `postType` | String | No | `'reply'` | enum: `new-post`, `reply` | 发布类型 |
| `draftContent` | String | No | — | — | AI 生成的草稿 |
| `finalContent` | String | No | — | — | 最终发布内容 |
| `charCount` | Number | No | — | — | 字数 |
| `adminEdit` | Boolean | No | `false` | — | 管理员是否编辑过 |
| **--- Gemini 评估 ---** |
| `relevanceScore` | Number | No | — | — | 相关性评分 |
| `worthReplying` | Boolean | No | — | — | 是否值得回复 |
| **--- Google Trends ---** |
| `googleTrends.matched` | Boolean | No | — | — | 是否匹配到热搜 |
| `googleTrends.trendTitle` | String | No | — | — | 匹配的热搜标题 |
| `googleTrends.trendTraffic` | String | No | — | — | 热搜流量 |
| `googleTrends.matchScore` | Number | No | — | — | 匹配分数 |
| **--- 发布结果 ---** |
| `postedAt` | Date | No | — | — | 发布时间 |
| `postId` | String | No | — | — | 论坛帖子 ID |
| `postUrl` | String | No | — | — | 论坛帖子 URL |
| `failReason` | String | No | — | — | 失败原因 |
| **--- 认领 & 审核 ---** |
| `claimedBy` | ObjectId | No | — | ref: `User` | 认领人 |
| `claimedAt` | Date | No | — | — | 认领时间 |
| `reviewedBy` | ObjectId | No | — | ref: `User` | 审核人 |
| `reviewedAt` | Date | No | — | — | 审核时间 |
| `adminNotes` | String | No | — | — | 管理员备注 |
| **--- 质量 ---** |
| `qualityWarnings` | [String] | No | — | — | 质量警告列表 |
| `isDuplicate` | Boolean | No | `false` | — | 是否重复 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

**Indexes:**

| Index | Fields | Options | Description |
|-------|--------|---------|-------------|
| status_createdAt | `{ status: 1, createdAt: -1 }` | — | 按状态查询，时间倒序 |
| thread_persona | `{ threadTid: 1, personaId: 1 }` | unique, sparse | 同一帖子同一人设不重复 |
| persona_status | `{ personaId: 1, status: 1 }` | — | 按人设查询 |
| board_status | `{ threadFid: 1, status: 1 }` | — | 按版块查询 |
| claim | `{ claimedBy: 1, claimedAt: 1 }` | — | 认领查询 |
| source_createdAt | `{ source: 1, createdAt: -1 }` | — | 按来源查询 |

---

## 4. personas

**Model:** `Persona` | **Module:** persona | **Collection:** `personas`

AI 人设表，每个人设对应一个 BK 论坛账号。密码 AES 加密。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `accountId` | String | Yes | — | unique, trim | 账号 ID |
| `username` | String | Yes | — | — | BK 论坛用户名 |
| `archetype` | String | Yes | — | enum: `pregnant`, `first-time-mom`, `multi-kid`, `school-age` | 人设原型 |
| `primaryToneMode` | String | No | — | — | 主语气模式 |
| `secondaryToneMode` | String | No | — | — | 副语气模式 |
| `avoidedToneMode` | String | No | — | — | 避免的语气 |
| `voiceCues` | [String] | No | — | — | 语气线索词 |
| `catchphrases` | [String] | No | — | — | 口头禅 |
| `topicBlacklist` | [String] | No | — | — | 话题黑名单 |
| `tier3Script` | String | No | — | — | Tier3 敏感话题脚本 |
| `maxPostsPerDay` | Number | No | `3` | — | 每日最大发帖数 |
| `bkPassword` | String | No | — | AES 加密 | BK 论坛密码（加密存储） |
| `bkUid` | Number | No | — | — | BK 论坛 UID |
| `bkToken` | String | No | — | — | BK 论坛 Token |
| `bkTokenExpiry` | Date | No | — | — | Token 过期时间 |
| `tokenStatus` | String | No | `'none'` | enum: `active`, `expired`, `none` | Token 状态 |
| `lastPostAt` | Date | No | — | — | 最后发帖时间 |
| `postsToday` | Number | No | `0` | — | 今日已发帖数（每日重置） |
| `cooldownUntil` | Date | No | — | — | 冷却截止时间 |
| `overrideNotes` | String | No | — | — | 管理员覆盖备注 |
| `isActive` | Boolean | No | `true` | — | 是否启用 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

**Hooks:**
- `pre('save')` — bkPassword 变更时自动 AES 加密
- `toJSON()` — bkPassword 显示为 `••••••••`，移除 __v

---

## 5. tonemodes

**Model:** `ToneMode` | **Module:** tone | **Collection:** `tonemodes`

语气模式表，定义 AI 生成内容时的语气风格。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `toneId` | String | Yes | — | unique, trim | 语气 ID |
| `displayName` | String | Yes | — | — | 显示名称 |
| `whenToUse` | String | No | — | — | 使用场景 |
| `emotionalRegister` | String | No | — | — | 情感寄存器 |
| `openingStyle` | String | No | — | — | 开场风格 |
| `sentenceStructure` | String | No | — | — | 句式结构 |
| `whatToAvoid` | String | No | — | — | 避免事项 |
| `exampleOpening` | String | No | — | — | 示例开场白 |
| `suitableForTier3` | Boolean | No | `false` | — | 是否适用于 Tier3 敏感话题 |
| `overridePriority` | Number | No | `5` | — | 覆盖优先级（数字越小越高） |
| `isActive` | Boolean | No | `true` | — | 是否启用 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

---

## 6. topicrules

**Model:** `TopicRule` | **Module:** topic-rules | **Collection:** `topicrules`

话题规则表，根据关键词匹配分配语气和敏感度。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `ruleId` | String | Yes | — | unique, trim | 规则 ID |
| `topicKeywords` | [String] | Yes | — | — | 话题关键词列表 |
| `sensitivityTier` | Number | No | `1` | enum: `1`, `2`, `3` | 敏感度层级（1=普通, 2=注意, 3=高敏感） |
| `sentimentTrigger` | String | No | `'any'` | enum: `any`, `positive`, `negative` | 情感触发条件 |
| `priorityAccountIds` | [String] | No | — | — | 优先使用的人设 ID 列表 |
| `assignToneMode` | String | No | `'auto'` | — | 指定语气模式（auto=自动） |
| `postTypePreference` | String | No | `'any'` | enum: `new-post`, `reply`, `any` | 偏好发布类型 |
| `geminiPromptHint` | String | No | — | — | Gemini 提示词补充 |
| `avoidIf` | String | No | — | — | 避免条件 |
| `isActive` | Boolean | No | `true` | — | 是否启用 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

---

## 7. forumcategories

**Model:** `ForumCategory` | **Module:** forum | **Collection:** `forumcategories`

论坛版块分类表。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `name` | String | Yes | — | — | 分类名称 |
| `sortOrder` | Number | No | `0` | — | 排序序号 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

---

## 8. forumboards

**Model:** `ForumBoard` | **Module:** forum | **Collection:** `forumboards`

论坛版块表，包含扫描配置和人设绑定。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `categoryId` | ObjectId | Yes | — | ref: `ForumCategory` | 所属分类 |
| `name` | String | Yes | — | — | 版块名称 |
| `fid` | Number | Yes | — | unique | BK 论坛版块 ID |
| `enableScraping` | Boolean | No | `false` | — | 是否启用扫描 |
| `enableAutoReply` | Boolean | No | `false` | — | 是否启用自动回复 |
| `replyThreshold.min` | Number | No | `0` | — | 回复数下限 |
| `replyThreshold.max` | Number | No | `40` | — | 回复数上限 |
| `scanInterval` | Number | No | `30` | — | 扫描间隔（分钟） |
| `defaultToneMode` | String | No | — | — | 默认语气模式 |
| `sensitivityTier` | Number | No | `1` | enum: `1`, `2`, `3` | 敏感度层级 |
| `note` | String | No | — | — | 备注 |
| `isActive` | Boolean | No | `true` | — | 是否启用 |
| `personaBindings` | [PersonaBinding] | No | — | 嵌入文档 | 人设绑定列表 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

**Embedded: PersonaBinding**（嵌入子文档，无独立 _id）

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `personaId` | ObjectId | Yes | — | ref: `Persona` | 人设 ID |
| `toneMode` | String | No | — | — | 该版块指定语气 |
| `weight` | String | No | `'medium'` | enum: `high`, `medium`, `low` | 权重 |
| `dailyLimit` | Number | No | `3` | — | 该版块每日限额 |

**Indexes:**

| Index | Fields | Options | Description |
|-------|--------|---------|-------------|
| fid | `{ fid: 1 }` | unique | 版块 FID 唯一 |

---

## 9. trends

**Model:** `Trend` | **Module:** trends | **Collection:** `trends`

热门趋势表，从 MediaLens/LIHKG/Facebook 拉取的热门话题。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `pullId` | String | Yes | — | — | 拉取批次 ID |
| `source` | String | Yes | — | enum: `medialens`, `lihkg`, `facebook` | 数据来源 |
| `rank` | Number | No | — | — | 排名 |
| `topicLabel` | String | Yes | — | — | 话题标签 |
| `summary` | String | No | — | — | 摘要 |
| `engagements` | Number | No | — | — | 互动量 |
| `postCount` | Number | No | — | — | 帖子数 |
| `sensitivityTier` | Number | No | `1` | enum: `1`, `2`, `3` | 敏感度层级 |
| `sentimentScore` | Number | No | — | — | 情感分数 |
| `sentimentLabel` | String | No | — | enum: `positive`, `negative`, `neutral` | 情感标签 |
| `toneMode` | String | No | — | — | 建议语气 |
| `isUsed` | Boolean | No | `false` | — | 是否已用于生成 |
| `usedAt` | Date | No | — | — | 使用时间 |
| `feedIds` | [String] | No | — | — | 关联的 Feed ID 列表 |
| `createdAt` | Date | auto | — | Mongoose timestamps (createdAt only) | 创建时间 |

**Indexes:**

| Index | Fields | Options | Description |
|-------|--------|---------|-------------|
| source_createdAt | `{ source: 1, createdAt: -1 }` | — | 按来源时间查询 |
| source_topic | `{ source: 1, topicLabel: 1 }` | unique | 同来源同话题不重复 |

---

## 10. queuejobs

**Model:** `QueueJob` | **Module:** queue | **Collection:** `queuejobs`

队列任务记录表，记录 BullMQ 任务执行历史。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `queueName` | String | Yes | — | enum: `scanner`, `trends`, `poster`, `daily-reset`, `stats-aggregator`, `ml-token-refresh` | 队列名称 |
| `jobId` | String | No | — | — | BullMQ Job ID |
| `status` | String | No | `'waiting'` | enum: `waiting`, `active`, `completed`, `failed` | 任务状态 |
| `startedAt` | Date | No | — | — | 开始时间 |
| `completedAt` | Date | No | — | — | 完成时间 |
| `duration` | Number | No | — | — | 执行时长（毫秒） |
| `result` | Mixed | No | — | — | 执行结果（任意类型） |
| `error` | String | No | — | — | 错误信息 |
| `triggeredBy` | String | No | `'cron'` | enum: `cron`, `manual` | 触发方式 |
| `triggeredByUser` | String | No | — | — | 手动触发的用户 |
| `createdAt` | Date | auto | — | Mongoose timestamps (createdAt only) | 创建时间 |

**Indexes:**

| Index | Fields | Options | Description |
|-------|--------|---------|-------------|
| queue_status_time | `{ queueName: 1, status: 1, createdAt: -1 }` | — | 按队列和状态查询 |

---

## 11. dailystats

**Model:** `DailyStats` | **Module:** dashboard | **Collection:** `dailystats`

每日统计聚合表，由 stats-aggregator Worker 每日生成。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `date` | String | Yes | — | unique, format: `YYYY-MM-DD` | 统计日期 |
| **--- 扫描统计 ---** |
| `scanner.totalScanned` | Number | No | `0` | — | 总扫描帖子数 |
| `scanner.totalHit` | Number | No | `0` | — | 命中数 |
| `scanner.hitRate` | Number | No | `0` | — | 命中率 |
| **--- Feed 统计 ---** |
| `feeds.generated` | Number | No | `0` | — | 生成数 |
| `feeds.approved` | Number | No | `0` | — | 通过数 |
| `feeds.rejected` | Number | No | `0` | — | 拒绝数 |
| `feeds.posted` | Number | No | `0` | — | 已发布数 |
| `feeds.failed` | Number | No | `0` | — | 失败数 |
| **--- 趋势统计 ---** |
| `trends.pulled` | Number | No | `0` | — | 拉取数 |
| `trends.used` | Number | No | `0` | — | 使用数 |
| **--- 发帖统计 ---** |
| `posts.threads` | Number | No | `0` | — | 新帖数 |
| `posts.replies` | Number | No | `0` | — | 回帖数 |
| **--- 版块明细 ---** |
| `byBoard[].fid` | Number | — | — | — | 版块 FID |
| `byBoard[].name` | String | — | — | — | 版块名称 |
| `byBoard[].scanned` | Number | — | `0` | — | 扫描数 |
| `byBoard[].hit` | Number | — | `0` | — | 命中数 |
| `byBoard[].posted` | Number | — | `0` | — | 发布数 |
| **--- 人设明细 ---** |
| `byPersona[].personaId` | String | — | — | — | 人设 ID |
| `byPersona[].username` | String | — | — | — | 用户名 |
| `byPersona[].posted` | Number | — | `0` | — | 发布数 |
| `byPersona[].dailyLimit` | Number | — | `0` | — | 每日限额 |
| `byPersona[].rejectedCount` | Number | — | `0` | — | 被拒数 |
| **--- Gemini 用量 ---** |
| `gemini.calls` | Number | No | `0` | — | API 调用次数 |
| `gemini.inputTokens` | Number | No | `0` | — | 输入 Token 数 |
| `gemini.outputTokens` | Number | No | `0` | — | 输出 Token 数 |
| `gemini.estimatedCost` | Number | No | `0` | — | 预估费用（USD） |
| **--- 质量指标 ---** |
| `quality.approvalRate` | Number | No | `0` | — | 通过率 |
| `quality.avgReviewTime` | Number | No | `0` | — | 平均审核时间 |
| `quality.duplicateCount` | Number | No | `0` | — | 重复数 |
| `createdAt` | Date | auto | — | Mongoose timestamps | 创建时间 |
| `updatedAt` | Date | auto | — | Mongoose timestamps | 更新时间 |

---

## 12. auditlogs

**Model:** `AuditLog` | **Module:** audit | **Collection:** `auditlogs`

审计日志表，自动 TTL 90 天过期。

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `_id` | ObjectId | auto | — | PK | MongoDB 主键 |
| `operator` | String | Yes | — | — | 操作人（userId 或 `'system'`） |
| `eventType` | String | Yes | — | — | 事件类型 |
| `module` | String | Yes | — | enum: `feed`, `persona`, `tone`, `topic-rules`, `forum`, `queue`, `config`, `auth`, `scanner`, `trends`, `poster`, `gemini` | 所属模块 |
| `feedId` | String | No | — | — | 关联 Feed ID |
| `targetId` | String | No | — | — | 操作目标 ID |
| `bkUsername` | String | No | — | — | BK 用户名 |
| `actionDetail` | String | No | — | — | 操作详情 |
| `before` | Mixed | No | — | — | 变更前数据 |
| `after` | Mixed | No | — | — | 变更后数据 |
| `apiStatus` | Number | No | — | — | API 响应状态码 |
| `ip` | String | No | — | — | 操作 IP |
| `session` | String | No | `'admin'` | enum: `admin`, `worker`, `api` | 会话类型 |
| `createdAt` | Date | auto | — | Mongoose timestamps (createdAt only) | 创建时间 |

**Indexes:**

| Index | Fields | Options | Description |
|-------|--------|---------|-------------|
| module_time | `{ module: 1, createdAt: -1 }` | — | 按模块时间查询 |
| ttl | `{ createdAt: 1 }` | expireAfterSeconds: 7776000 (90d) | 90 天自动过期 |

---

## Entity Relationship Diagram (Text)

```
User ──────────────────┐
  │                    │
  │ claimedBy/         │ reviewedBy
  ▼                    ▼
Feed ◄──────────── Trend (feedIds)
  │
  │ threadFid          personaId
  ▼                    ▼
ForumBoard ────── Persona
  │ personaBindings
  │
  │ categoryId
  ▼
ForumCategory

TopicRule ──── (keyword matching) ──── Feed
ToneMode  ──── (tone assignment) ──── Feed / Persona / ForumBoard

Config          (standalone, key-value)
AuditLog        (standalone, append-only, TTL)
QueueJob        (standalone, job history)
DailyStats      (standalone, daily aggregation)
```

---

## Collection Count Summary

| # | Collection | Model | Records | Notes |
|---|-----------|-------|---------|-------|
| 1 | users | User | Few | 管理员账号 |
| 2 | configs | Config | 46 (seed) | 系统配置 |
| 3 | feeds | Feed | Growth | 核心业务，持续增长 |
| 4 | personas | Persona | 30 (seed) | AI 人设 |
| 5 | tonemodes | ToneMode | 5 (seed) | 语气模式 |
| 6 | topicrules | TopicRule | 12 (seed) | 话题规则 |
| 7 | forumcategories | ForumCategory | Few | 版块分类 |
| 8 | forumboards | ForumBoard | 34 (seed) | 论坛版块 |
| 9 | trends | Trend | Growth | 热门趋势 |
| 10 | queuejobs | QueueJob | Growth | 任务记录 |
| 11 | dailystats | DailyStats | 1/day | 每日统计 |
| 12 | auditlogs | AuditLog | Growth, TTL 90d | 审计日志，自动过期 |
