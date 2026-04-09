# Baby Kingdom Admin 后台管理系统 - 设计文档

## 1. 项目概述

将现有基于 Google Apps Script + Google Sheets 的 Baby Kingdom 论坛内容运营系统，完整迁移为独立的 Admin 后台管理系统。新系统完全替代 GAS，上线后停用旧系统。

**参考站点:** [https://www.baby-kingdom.com/forum.php](https://www.baby-kingdom.com/forum.php)

## 2. 技术栈


| 层级    | 技术                                                  |
| ----- | --------------------------------------------------- |
| 前端    | Vue 3 + Element Plus + Pinia + Vue Router           |
| 后端    | Express + Socket.io + Mongoose + BullMQ             |
| AI    | Google AI SDK for Node.js (`@google/generative-ai`) |
| 数据库   | MongoDB 7                                           |
| 缓存/队列 | Redis 7 (Socket.io adapter + BullMQ)                |
| 部署    | Docker Compose                                      |


## 3. 整体架构

```
┌─────────────────────────────────────────────────┐
│                 Docker Compose                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Frontend │  │ Backend  │  │    Worker      │  │
│  │ Vue 3    │──│ Express  │──│ node-cron      │  │
│  │ Element+ │  │ REST API │  │ BullMQ jobs    │  │
│  │ Nginx    │  │ Socket.io│  │                │  │
│  └──────────┘  └────┬─────┘  └───────┬───────┘  │
│                     │                │           │
│               ┌─────┴────────────────┴─────┐     │
│               │         Redis              │     │
│               │  (WebSocket + Job Queue)   │     │
│               └────────────────────────────┘     │
│               ┌────────────────────────────┐     │
│               │        MongoDB             │     │
│               └────────────────────────────┘     │
└─────────────────────────────────────────────────┘
```

### 容器职责


| 容器           | 职责                                                          |
| ------------ | ----------------------------------------------------------- |
| **frontend** | Admin 后台 UI，Nginx 托管静态资源                                    |
| **backend**  | REST API、WebSocket 推送、任务分发                                  |
| **worker**   | 定时触发 ThreadScanner/TrendPuller/DailyReset，执行 Gemini 调用和论坛发帖 |
| **redis**    | Socket.io adapter、BullMQ 任务队列                               |
| **mongodb**  | 所有业务数据持久化                                                   |


### 通信方式

- Frontend <-> Backend: REST API + Socket.io
- Backend <-> Worker: BullMQ (Redis) 任务队列
- Worker 完成任务后通过 Redis pub/sub 通知 Backend，Backend 再通过 Socket.io 推送到前端

## 4. 架构模式：模块化 Monolith

后端按业务领域严格分模块，每个模块有独立的 routes/services/models，未来可低成本拆为微服务。

## 5. 后端模块划分

```
backend/src/
├── modules/
│   ├── auth/           # 用户认证与权限
│   ├── feed/           # Feed Queue 管理
│   ├── scanner/        # ThreadScanner
│   ├── poster/         # BKForumPoster
│   ├── trends/         # TrendPuller
│   ├── persona/        # Persona Tone Config
│   ├── tone/           # Tone Modes
│   ├── topic-rules/    # Topic-Persona Rules
│   ├── forum/          # 论坛版块配置
│   ├── config/         # 系统设置
│   ├── queue/          # 任务队列管理与监控
│   ├── gemini/         # Gemini AI 调用封装
│   └── audit/          # 操作日志
├── shared/             # 公共工具
├── app.js
└── server.js
```

### 每个模块统一结构

```
modules/<name>/
├── <name>.routes.js
├── <name>.controller.js
├── <name>.service.js
├── <name>.model.js
└── <name>.validator.js
```

### 模块职责


| 模块              | 核心功能                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **auth**        | 注册、登录（JWT）、角色管理（Admin/Editor/Viewer）、权限中间件                                                                             |
| **feed**        | Feed Queue CRUD、状态流转（PENDING->APPROVED->POSTED/REJECTED/FAILED）、Claim/Unclaim 锁定、内容编辑、批量操作、自定义生成、重新生成（切换 Tone/Persona） |
| **scanner**     | 扫描配置管理、手动触发扫描、扫描历史查看、7 层过滤 + 2 个熔断（详见第 9.3 节）                                                                          |
| **poster**      | BK 账号管理、论坛 API 调用（登录/发帖/回复）、频率限制（35s）                                                                                  |
| **trends**      | 趋势数据拉取、数据源配置（MediaLens/LIHKG/FB）、趋势日志查看、MediaLens OTP 认证与 JWT 管理                                                       |
| **persona**     | Persona CRUD（用户名、Archetype、语气模式、口头禅、话题黑名单、每日上限）                                                                        |
| **tone**        | Tone Modes CRUD（开场风格、情感基调、避免事项、示例开场白）                                                                                  |
| **topic-rules** | Topic-Persona Rules CRUD（敏感分级、指定语气、Gemini Prompt Hint、排除条件）                                                            |
| **forum**       | 版块分类管理、版块配置（抓取开关、自动回复开关、阈值、频率）、版块-Persona 关联（含版块专属 Tone）、自动同步 BK 论坛版块索引                                                |
| **config**      | 系统配置键值对 CRUD，支持敏感配置加密存储                                                                                                |
| **queue**       | 查看各队列状态、启用/暂停/恢复、手动触发、执行历史、失败重试、实时进度推送                                                                                 |
| **gemini**      | Prompt 构建（Persona + Tone + Rules + Trend + Google Trends）、Google AI SDK 调用、响应解析、Google Trends 热点匹配、敏感度自动分级、语气自动选择      |
| **audit**       | 操作日志记录与查询                                                                                                              |


## 6. 前端架构

```
frontend/src/
├── api/                # Axios 封装 + 各模块 API 调用
├── socket/             # Socket.io 客户端封装
│   ├── index.js        # 连接管理（自动重连、token 认证）
│   └── listeners.js    # 事件监听注册
├── stores/             # Pinia 状态管理
│   ├── auth.js
│   ├── feed.js
│   ├── queue.js
│   ├── notification.js
│   └── ...
├── views/
│   ├── dashboard/      # 仪表盘概览
│   ├── feed/           # Feed Queue 管理
│   ├── scanner/        # 扫描管理
│   ├── trends/         # 趋势数据
│   ├── poster/         # 发帖管理
│   ├── persona/        # Persona 管理
│   ├── tone/           # Tone Modes 管理
│   ├── topic-rules/    # Topic-Persona Rules 管理
│   ├── forum/          # 版块配置
│   ├── config/         # 系统设置
│   ├── queue/          # 任务队列监控
│   ├── audit/          # 操作日志
│   └── user/           # 用户管理
├── components/         # 公共组件
├── router/
├── App.vue
└── main.js
```

### Socket.io 实时推送事件


| 事件                   | 触发时机         | 前端响应                                     |
| -------------------- | ------------ | ---------------------------------------- |
| `feed:new`           | Worker 生成新草稿 | 顶部横幅提示"有 N 条新 Feed，点击刷新"（不直接插入列表，避免分页错乱） |
| `feed:statusChanged` | Feed 状态变更    | 列表状态实时更新                                 |
| `feed:claimed`       | Feed 被锁定     | 其他用户实时看到锁定状态和锁定人                         |
| `feed:unclaimed`     | Feed 锁定释放    | 其他用户实时看到可操作状态                            |
| `queue:status`       | 队列状态变化       | 队列监控面板实时刷新                               |
| `queue:progress`     | 任务执行进度       | 进度条/日志实时滚动                               |
| `scanner:result`     | 一轮扫描完成       | 显示扫描结果摘要                                 |
| `trends:new`         | 新趋势数据入库      | 趋势列表自动更新                                 |


通知机制：Socket 事件 -> Pinia notification store -> Element Plus ElNotification 弹窗。页面订阅相关事件，离开页面自动取消订阅。

## 7. 论坛版块配置

### 版块分类


| 分类   | 版块                                                     |
| ---- | ------------------------------------------------------ |
| 吹水玩樂 | 自由講場、影視娛樂、美容扮靚、潮流時尚、烹飪搵食、親子旅遊、興趣嗜好                     |
| 時事理財 | 樓市動向、家庭理財、時政擂台                                         |
| 由家出發 | 夫婦情感、婆媳關係、醫護健康、健康談性、單親天地、少年成長、論盡家傭、家事百科、鐘點工人、爸爸專區、心聲留言 |
| 媽媽天地 | 想生BB、懷孕前後、母乳餵哺、婦女醫護、在職全職媽媽會所                           |
| 育兒教養 | 嬰兒用品、嬰兒食譜、嬰兒醫護                                         |
| 情報分享 | 自由報料、二手市場、開倉報料、齊齊著數、求職招聘、網購天地                          |
| 意見反饋 | 使用意見、故障報告                                              |


### 每个版块配置项


| 配置项            | 说明                  |
| -------------- | ------------------- |
| 启用抓取           | 是否让 Scanner 扫描该版块   |
| 启用自动回复         | 抓取后是否自动生成 Gemini 回复 |
| 回复阈值           | 帖子回复数范围（默认 0-40）    |
| 扫描频率           | 扫描间隔（默认 30 分钟）      |
| 版块默认 Tone Mode | 未指定角色专属语气时的回退默认值    |
| 敏感等级           | Tier 1-3            |
| 备注             | 管理员备注               |


### 版块-Persona 关联

每个版块可关联多个 Persona，每个关联可独立配置：


| 关联配置           | 说明                              |
| -------------- | ------------------------------- |
| Persona        | 关联的虚拟角色                         |
| 版块专属 Tone Mode | 该角色在此版块使用的语气（覆盖角色默认语气）          |
| 权重             | 该角色在此版块被选中的优先级（high/medium/low） |
| 每日上限           | 该角色在此版块的每日回复上限                  |


示例：同一个 Persona 在「自由講場」用「輕鬆吹水」语气，在「婆媳關係」用「同理共感」语气。

## 8. 数据库设计 (MongoDB)

### 8.1 users

```javascript
{
  username, email, password (bcrypt),
  role: "admin" | "editor" | "viewer",
  lastLoginAt, createdAt, updatedAt
}
```

### 8.2 personas

```javascript
{
  accountId: "BK009",
  username: "港媽小麗",
  archetype: "first-time-mom",  // pregnant / first-time-mom / multi-kid / school-age
  primaryToneMode,
  secondaryToneMode,
  avoidedToneMode,
  voiceCues: ["常用語氣詞"],
  catchphrases: ["口頭禪"],
  topicBlacklist: ["避免話題"],
  tier3Script: "Tier3 特殊腳本",
  maxPostsPerDay: 5,
  bkPassword: "加密存储",
  bkUid: 3459486,                      // BK 论坛用户 ID
  bkToken: "緩存登錄token",
  bkTokenExpiry,
  tokenStatus: "active" | "expired" | "none",
  lastPostAt,                          // 最近一次发帖时间
  postsToday: 0,                       // 今日已发帖数（每日重置）
  cooldownUntil,                       // 冷却截止时间（频率限制）
  overrideNotes: "管理員備註",          // 管理员观察记录
  isActive: true,
  createdAt, updatedAt
}
```

### 8.3 toneModes

```javascript
{
  toneId: "EMPATHISE",                  // GAS key，唯一标识
  displayName: "同理共感",              // UI 显示名称
  whenToUse: "使用場景描述",            // 何时使用该语气
  emotionalRegister: "情感基調",
  openingStyle: "開場風格描述",         // 注入 Gemini prompt
  sentenceStructure: "句式結構提示",    // 句式指引
  whatToAvoid: "避免事項",              // 注入为负面约束
  exampleOpening: "示例開場白",
  suitableForTier3: false,             // 是否适用于 Tier 3 话题
  overridePriority: 3,                 // 覆盖优先级（1=最高）
  isActive: true,
  createdAt, updatedAt
}
```

### 8.4 topicRules

```javascript
{
  ruleId: "RULE-001",                   // 业务编号，唯一标识
  topicKeywords: ["IVF", "試管嬰兒", "備孕"],  // 关键词数组（匹配趋势标签）
  sensitivityTier: 1 | 2 | 3,
  sentimentTrigger: "any" | "positive" | "negative",  // 情感触发条件
  priorityAccountIds: ["BK003", "BK006", "BK001"],    // 优先使用的 Persona（按优先级排序）
  assignToneMode,                       // 指定 Tone Mode ID，或 "auto"
  postTypePreference: "new-post" | "reply" | "any",   // 发帖类型偏好
  geminiPromptHint: "寫作提示",          // 注入 Gemini prompt
  avoidIf: "排除條件",
  isActive: true,
  createdAt, updatedAt
}
```

### 8.5 forumCategories

```javascript
{
  name: "吹水玩樂",
  sortOrder: 1,
  createdAt, updatedAt
}
```

### 8.6 forumBoards

```javascript
{
  categoryId,
  name: "自由講場",
  fid: 162,
  enableScraping: true,
  enableAutoReply: true,
  replyThreshold: { min: 0, max: 40 },
  scanInterval: 30,
  defaultToneMode,
  sensitivityTier: 1,
  note: "備註",
  isActive: true,
  personaBindings: [{
    personaId,
    toneMode,           // 版块专属语气
    weight: "high" | "medium" | "low",
    dailyLimit: 5
  }],
  createdAt, updatedAt
}
```

### 8.7 feeds

```javascript
{
  feedId,
  type: "thread" | "reply",
  status: "pending" | "approved" | "rejected" | "posted" | "failed",
  source: "scanner" | "trends" | "custom",  // 大类来源
  // 帖子信息
  threadTid, threadFid,
  threadSubject,                        // 原帖标题
  threadContent: "帖子原文摘要",
  subject: "新帖標題",                   // 新帖时的标题（type=thread 时使用）
  // 趋势来源信息
  trendSource: "viral-topics" | "lihkg" | "fb-viral" | "SCAN" | "CUSTOM",  // 具体来源
  trendSentiment: 85,                   // 趋势情感分数
  trendEngagement: 12000,               // 趋势互动量
  pullTime,                             // 趋势拉取时间
  // 生成内容
  personaId,
  bkUsername: "港媽小麗",                // BK 论坛用户名
  displayName: "小麗媽咪",              // 显示名
  archetype: "first-time-mom",          // 账号类型
  toneMode,
  sensitivityTier: "Tier 1 — Safe",     // 敏感等级
  postType: "new-post" | "reply",       // 发帖类型
  draftContent: "Gemini 生成草稿",
  finalContent: "管理員編輯後最終版",
  charCount: 169,                       // 内容字数
  adminEdit: false,                     // 是否被管理员编辑过
  // Gemini 评估
  relevanceScore: 75,
  worthReplying: true,
  // Google Trends 热点
  googleTrends: {
    matched: true,
    trendTitle: "熱點標題",
    trendTraffic: "50K+",
    matchScore: 0.85
  },
  // 发帖结果
  // 发帖结果
  postedAt, postId, postUrl,
  failReason,
  // Claim 锁定（防止多人同时审核）
  claimedBy,                            // 锁定人 userId
  claimedAt,                            // 锁定时间（10 分钟过期）
  // 审核
  reviewedBy, reviewedAt,
  adminNotes,
  createdAt, updatedAt
}
```

### 8.8 trends

```javascript
{
  pullId: "PULL-20260406-1200",         // 拉取批次 ID
  source: "medialens" | "lihkg" | "facebook",
  rank: 1,                              // 排名
  topicLabel, summary,
  engagements: 12000,                   // 互动量
  postCount: 350,                       // 帖子数
  sensitivityTier,
  sentimentScore: 85,                   // 情感分数（0-100）
  sentimentLabel: "positive" | "negative" | "neutral",  // 情感标签
  toneMode,
  isUsed: false,
  usedAt,
  feedIds: ["FQ-xxx", "FQ-yyy"],        // 由此趋势生成的 Feed ID 列表
  createdAt
}
```

### 8.9 queueJobs

```javascript
{
  queueName: "scanner" | "trends" | "poster" | "daily-reset",
  jobId,
  status: "waiting" | "active" | "completed" | "failed",
  startedAt, completedAt,
  duration,
  result: {},
  error,
  triggeredBy: "cron" | "manual",
  triggeredByUser,
  createdAt
}
```

### 8.10 configs

```javascript
{
  key: "GEMINI_MODEL",
  value: "gemini-2.5-flash",
  category: "gemini" | "bk-forum" | "medialens" | "google-trends" | "scanner" | "general",
  description: "配置描述",
  isSecret: false,        // 敏感配置加密存储，前端脱敏显示
  updatedBy, updatedAt, createdAt
}
```

#### 预置配置项

**MediaLens:**
MEDIALENS_BASE_URL, MEDIALENS_AUTH_EMAIL, MEDIALENS_JWT_TOKEN (secret), MEDIALENS_COUNTRY, TREND_PULL_INTERVAL_HRS, TREND_LOOKBACK_DAYS, TREND_LIMIT, FEEDS_PER_TREND_PULL, MAX_PENDING_QUEUE, ENABLE_LIHKG, ENABLE_FB_VIRAL

**BK Forum:**
BK_BASE_URL, BK_APP, BK_VER, BK_RATE_LIMIT_SECONDS, BK_MAX_POSTS_PER_ACCOUNT_DAY, BK_POST_INTERVAL_SEC

**Gemini:**
GEMINI_API_KEY (secret), GEMINI_MODEL, GEMINI_TEMPERATURE, GEMINI_MAX_OUTPUT_TOKENS, CONTENT_LANGUAGE, GEMINI_SYSTEM_PROMPT, GEMINI_TASK_TEMPLATE, SENTIMENT_NEGATIVE_THRESHOLD, TONE_OVERRIDE_ON_TIER3, SHORT_POST_MAX_CHARS, MEDIUM_POST_MAX_CHARS, LONG_POST_MAX_CHARS, GCP_PROJECT_ID, GEMINI_GCP_PROJECT_ID, GEMINI_VERTEX_REGION

**Google Trends:**
GOOGLE_TRENDS_API_KEY (secret), GOOGLE_TRENDS_BASE_URL (`https://seo-hk-mac.rankwriteai.com`), GOOGLE_TRENDS_ENABLED, GOOGLE_TRENDS_REGION (HK), GOOGLE_TRENDS_MATCH_THRESHOLD (0.6), GTRENDS_GEO (HK), GTRENDS_LOOKBACK_HOURS (24), GTRENDS_TOP_N (10)

**Scanner:**
SCANNER_RELEVANCE_THRESHOLD (35), SCANNER_TIMEOUT_MINUTES (5), MAX_PENDING_QUEUE (100)

**General:**
ADMIN_EMAILS, TIMEZONE, LOG_RETENTION_DAYS, MAX_POSTS_PER_DAY

### 8.11 dailyStats

```javascript
{
  date: "2026-04-06",
  scanner: {
    totalScanned: 500,
    totalHit: 35,
    hitRate: 0.07
  },
  feeds: {
    generated: 35,
    approved: 20,
    rejected: 8,
    posted: 18,
    failed: 2
  },
  trends: {
    pulled: 15,
    used: 5
  },
  posts: {
    threads: 5,
    replies: 13
  },
  byBoard: [{
    fid: 162,
    name: "自由講場",
    scanned: 200,
    hit: 15,
    posted: 8
  }],
  byPersona: [{
    personaId: "BK009",
    username: "港媽小麗",
    posted: 3,
    dailyLimit: 5,
    rejectedCount: 1                    // 被拒数，用于计算 Persona 表现
  }],
  gemini: {                             // Gemini API 成本追踪
    calls: 150,                         // API 调用次数
    inputTokens: 45000,
    outputTokens: 12000,
    estimatedCost: 0.85                 // 估算费用（USD）
  },
  quality: {                            // 内容质量指标
    approvalRate: 0.71,                 // 审核通过率
    avgReviewTime: 300,                 // 平均审核时长（秒）
    duplicateCount: 2                   // 重复内容拦截数
  },
  createdAt, updatedAt
}
```

### 8.12 auditLogs

```javascript
{
  operator: "userId 或 system",
  eventType: "TREND_PULL" | "FEED_GENERATED" | "FEED_APPROVED" | "FEED_REJECTED" |
             "FEED_POSTED" | "CONFIG_UPDATED" | "ML_AUTH_SUCCESS" | "ML_AUTH_FAILED" |
             "GEMINI_ERROR" | "GEMINI_CALL" | "DAILY_RESET" | "SCAN_COMPLETE" |
             "QUEUE_PAUSED" | "QUEUE_RESUMED" | "USER_LOGIN" | "USER_LOGOUT" |
             "ROLE_CHANGED" | "USER_CREATED" | "USER_DELETED" |
             "PERSONA_CREATED" | "PERSONA_UPDATED" | "PERSONA_DELETED" |
             "TONE_CREATED" | "TONE_UPDATED" | "TONE_DELETED" |
             "RULE_CREATED" | "RULE_UPDATED" | "RULE_DELETED" |
             "FORUM_UPDATED" | "BK_POST_SUCCESS" | "BK_POST_FAILED",
  module: "feed" | "persona" | "tone" | "forum" | "queue" | "config" | "auth" |
          "scanner" | "trends" | "poster" | "gemini",
  feedId,                               // 关联的 Feed ID（如适用）
  targetId,                             // 操作目标 ID
  bkUsername,                           // 关联的 BK 账号（如适用）
  actionDetail: "详情描述",
  before: {},
  after: {},
  apiStatus: 200,                       // API 调用 HTTP 状态码（如适用）
  ip,
  session: "admin" | "worker" | "api",
  createdAt
}
```

### 索引策略

- `feeds`: { status, createdAt } 复合索引
- `feeds`: { threadTid, personaId } 复合唯一索引（同帖可被不同 Persona 回复）
- `feeds`: { personaId, status } 复合索引
- `feeds`: { threadFid, status } 复合索引
- `feeds`: { claimedBy, claimedAt } 复合索引（Claim 过期检查）
- `feeds`: { source, createdAt } 复合索引
- `personas`: { accountId } 唯一索引
- `toneModes`: { toneId } 唯一索引
- `topicRules`: { ruleId } 唯一索引
- `configs`: { key } 唯一索引
- `auditLogs`: { module, createdAt } 复合索引
- `auditLogs`: { createdAt } TTL 索引（自动清理，过期时间由 LOG_RETENTION_DAYS 控制）
- `trends`: { source, createdAt } 复合索引
- `trends`: { source, topicLabel } 复合唯一索引（跨批次去重）
- `queueJobs`: { queueName, status, createdAt } 复合索引
- `dailyStats`: { date } 唯一索引

## 9. Gemini AI 集成

### 9.1 Prompt 构建流程

```
systemPrompt ← ⚙️ Config: GEMINI_SYSTEM_PROMPT

userPrompt 拼接顺序：
  【角色設定】Persona Block
    ├── voiceCues (说话习惯，逐字注入)
    ├── catchphrases (口头禅，逐字注入)
    └── tier3Script (Tier 3 时替换整个 Tone Block)
  +
  【今日發文語氣】Tone Mode Block
    ├── openingStyle (开场风格指令，注入 prompt)
    ├── sentenceStructure (句式结构提示，注入 prompt)
    └── whatToAvoid (避免事项，注入为负向约束)
  +
  【今日熱話】Trend/Thread Block
    ├── topicLabel / threadSubject
    ├── summary / threadContent
    ├── sentimentScore
    └── sensitivityTier
  +
  【額外寫作指引】Rule Hint Block (Topic-Persona Rules: geminiPromptHint，逐字追加)
  +
  【Google 熱點】Google Trends Block (仅匹配时注入)
    ├── trendTitle
    └── trendTraffic
  +
  任務指令 ← ⚙️ Config: GEMINI_TASK_TEMPLATE
```

**Tier 3 特殊处理：** 当话题为 Tier 3 时，Persona 的 `tier3Script` 替换标准的 Tone Mode Block，且强制使用 `TONE_OVERRIDE_ON_TIER3`（默认 EMPATHISE）。

**情感自动覆盖：** 当 `sentimentScore <= SENTIMENT_NEGATIVE_THRESHOLD`（默认 45）时，自动覆盖为 EMPATHISE 语气。

### 9.1.1 敏感度分级系统

**三级敏感度：**


| 等级                 | 说明                       | 语气处理              |
| ------------------ | ------------------------ | ----------------- |
| Tier 1 — Safe      | 安全话题（IVF、副食品、幼稚园等）       | 正常语气选择逻辑          |
| Tier 2 — Moderate  | 中度敏感（分娩、母乳、情绪、高齢产妇等）     | 正常语气选择逻辑          |
| Tier 3 — Sensitive | 高度敏感（产后抑郁、离婚、ADHD、婆媳矛盾等） | 强制使用 EMPATHISE 语气 |


**自动分配逻辑（优先级从高到低）：**

1. **规则优先**：Topic-Persona Rules 中匹配的规则直接指定 tier
2. **关键词回退**：未匹配规则时，使用关键词列表判断：
  - Tier 3: 抑鬱、崩潰、離婚、單親、婆媳、ADHD、特殊教育
  - Tier 2: 分娩、母乳、奶粉、VBAC、高齡、情緒
  - 默认: Tier 1

**语气选择优先级链：**

```
Tier 3 → 强制 EMPATHISE（或 TONE_OVERRIDE_ON_TIER3 配置）
  ↓ (非 Tier 3)
负面情感 (score ≤ SENTIMENT_NEGATIVE_THRESHOLD) → EMPATHISE
  ↓ (非负面)
规则指定语气 (非 Auto) → 使用规则语气
  ↓ (规则为 Auto 或无规则)
人设主语气 (primaryMode) → 使用人设语气
  ↓ (无人设)
默认: INFO_SHARE
```

### 9.2 Scanner 两种 Gemini 调用模式

**模式 A — ThreadScanner（两步调用，成本优化）：**

Scanner 扫描帖子时，分两步调用 Gemini 以节省 Token：

**第一步 — 评估（低 Token 消耗）：** 仅返回评分判断，不生成回复内容

```javascript
{
  relevanceScore: 75,        // 亲子相关性 0-100
  worthReplying: true,       // 是否值得回复
  topic: "幼稚園面試",       // 话题摘要
  tier: "Tier 1 — Safe",    // 敏感度
  toneMode: "SHARE_EXP",    // 推荐语气模式
  sentimentScore: 80,        // 情感分数（用于语气自动覆盖）
  reasoning: "..."           // 判断理由
}
```

**第二步 — 生成（仅通过评分门槛的帖子）：** 经过第 5-7 层过滤后，调用完整 Prompt 构建流程生成回复

> 成本优化：根据历史数据（命中率约 7%），两步拆分后可节省约 93% 不合格帖子的生成 Token。

**模式 B — FeedGenerator（多步生成新帖）：**

TrendPuller 拉取趋势后，通过完整的多步流程生成：选 Persona → 匹配 Topic Rule → 构建 Prompt → 调用 Gemini → 生成草稿。

### 9.3 ThreadScanner 7 层过滤 + 2 个熔断

**7 层筛选：**


| 层级  | 筛选规则                                                            | 消耗 Gemini Token |
| --- | --------------------------------------------------------------- | --------------- |
| 1   | 队列容量守卫：`currentPending >= MAX_PENDING_QUEUE`（默认 100），队列满则跳过整个扫描 | 否               |
| 2   | 回复数过滤：帖子回复数必须在 0~40 之间（可按版块配置 replyThreshold）                   | 否               |
| 3   | 去重：Feed Queue 中已有相同 tid 则跳过                                     | 否               |
| 4   | 内容获取失败：帖子被删、无权限、API 错误                                          | 否               |
| 5   | Gemini 评分门槛：`relevanceScore < 35` 则淘汰（与亲子/育儿话题无关）               | **是**           |
| 6   | Gemini 判断不值得：`worthReplying = false`（虽相关但没回复空间）                 | **是**           |
| 7   | 无可用 Persona：所有账号达到每日发帖上限，或话题在黑名单中                               | **是**           |


> Token 消耗提示：第 1-4 层是轻量过滤（不调 Gemini），第 5-7 层在 Gemini 调用之后。每条通过前 4 层的帖子都会消耗一次 Gemini API 调用。

**2 个全局熔断：**


| 熔断条件 | 触发逻辑                                                         |
| ---- | ------------------------------------------------------------ |
| 队列满  | `currentPending + added >= MAX_PENDING_QUEUE`，循环中随时检查，满了立即停止 |
| 执行超时 | 扫描运行超过 5 分钟，安全退出（防止长时间阻塞 Worker）                             |


**Scanner 相关配置项（在 configs 集合中）：**


| Key                         | 默认值 | 说明             |
| --------------------------- | --- | -------------- |
| SCANNER_RELEVANCE_THRESHOLD | 35  | Gemini 相关性评分门槛 |
| SCANNER_TIMEOUT_MINUTES     | 5   | 扫描超时时间         |
| MAX_PENDING_QUEUE           | 100 | 队列容量上限         |


### 9.4 Google Trends 热点匹配

**使用自建 Google Trends API（非官方 API）：**

- 基础 URL: `https://seo-hk-mac.rankwriteai.com`
- 认证: `X-API-Key` header（GOOGLE_TRENDS_API_KEY）
- 端点:
  - GET `/trends/summary` — 趋势排名摘要（主要使用）
  - GET `/trends/detail` — 单条趋势时间线 + 新闻详情
  - POST `/call/get_google_trends` — 旧版 API（回退）

**匹配流程：**

1. 提取帖子/趋势关键词
2. 查询 Google Trends 自建 API，检索相关热点
3. 如果匹配分数 >= GOOGLE_TRENDS_MATCH_THRESHOLD（默认 0.6），将热点上下文注入 Prompt
4. 生成的回复自然融入热点话题

### 9.5 Gemini 模块结构

```
backend/src/modules/gemini/
├── gemini.service.js           # Google AI SDK 调用
├── prompt.builder.js           # Prompt 组装（含所有 block）
└── google-trends.service.js    # Google Trends API 调用 + 关键词匹配
```

## 9.6 Feed 生命周期与 Claim 机制

### Feed 状态机

```
[生成]          [审核]          [发布]
  │               │               │
  ▼               ▼               ▼
PENDING ──→ APPROVED ──→ POSTED
  │
  └──→ REJECTED

状态转换:
  PENDING → APPROVED : approve（可编辑内容、覆盖语气/角色）
  PENDING → REJECTED : reject（填写原因）
  APPROVED → POSTED  : post（调用 BK Forum API）
  APPROVED → FAILED  : post 失败（记录 failReason）
```

### Claim 锁定机制

防止多个管理员同时审核同一条 Feed：

1. 管理员点击 Feed 时自动 Claim，写入 `claimedBy` + `claimedAt`
2. Claim 有效期 **10 分钟**，过期自动释放
3. 其他人看到已 Claim 的 Feed 显示锁定状态和锁定人
4. Claim 持有者可手动 Unclaim 释放
5. Approve/Reject 操作会自动清除 Claim

### 自定义生成（Custom Generate）

管理员可手动输入任意主题，指定 Persona 和 Tone Mode，由 Gemini 生成新草稿：

1. 输入主题/描述
2. 选择 Persona（可选，默认随机）
3. 选择 Tone Mode（可选，默认 Auto）
4. 选择 Post Type（New Post / Reply）
5. 生成后进入 Feed Queue 状态为 PENDING

### 重新生成（Regenerate）

对已有的 PENDING Feed 重新生成内容：

1. 可切换 Tone Mode
2. 可切换 Persona
3. 保留原始帖子/趋势信息
4. 新草稿覆盖原 draftContent，清空 finalContent 和 adminEdit

## 10. 任务队列设计

### 队列列表


| 队列               | 触发方式           | 频率                        |
| ---------------- | -------------- | ------------------------- |
| scanner          | node-cron + 手动 | 每 30 分钟                   |
| trends           | node-cron + 手动 | 每 1 小时                    |
| poster           | 事件驱动（Feed 审批后） | 即时                        |
| daily-reset      | node-cron      | 每日午夜                      |
| stats-aggregator | node-cron      | 每 1 小时                    |
| ml-token-refresh | node-cron      | 每 12 小时（MediaLens JWT 刷新） |


### 管理能力

- 查看各队列运行状态、待执行/执行中/已完成/失败数量
- 暂停/恢复单个队列
- 手动触发执行
- 查看执行历史（开始时间、结束时间、耗时、结果）
- 失败任务手动重试
- Socket.io 实时推送执行进度

## 11. Dashboard 仪表盘

### A) 实时状态区

- 各队列运行状态（Scanner/TrendPuller/Poster/DailyReset）
- 当前待审核 Feed 数量

### B) 今日统计区

- 今日扫描帖子数 / 命中数
- 今日生成草稿数
- 今日已发帖数 / 已回复数
- 今日新趋势数
- 各 Persona 今日已用额度 / 剩余额度

### C) 最近动态区

- 最近 Feed 状态变更（时间线）
- 最近发帖成功/失败记录
- 最近扫描结果摘要

### D) 趋势图表区

- 近 7 天发帖/回复数量趋势
- 近 7 天扫描命中率趋势
- 各版块活跃度分布

### E) 质量与成本区

- 审核通过率趋势（approved / total reviewed）
- 平均审核时长
- Gemini API 每日 Token 消耗和费用估算
- 各 Persona 表现对比（发帖量 vs 被拒率）

### F) 系统健康区

- 外部依赖状态（BK Forum / MediaLens / Gemini / Google Trends 连通性）
- MediaLens JWT 剩余有效期
- BK 账号健康度汇总（Token 状态、冷却状态、今日剩余额度）

### 数据来源


| 数据      | 来源                | 方式                |
| ------- | ----------------- | ----------------- |
| 队列状态    | Redis (BullMQ)    | 实时查询              |
| 待审核数    | feeds 集合          | 实时查询              |
| 今日/历史统计 | dailyStats        | 预计算（Worker 每小时聚合） |
| 最近动态    | feeds + queueJobs | 实时查询（limit 20）    |


## 12. 用户角色与权限


| 权限                      | Admin | Editor | Viewer |
| ----------------------- | ----- | ------ | ------ |
| 仪表盘                     | r     | r      | r      |
| Feed 审核/编辑/发帖           | rw    | rw     | r      |
| Persona/Tone/Rules CRUD | rw    | r      | r      |
| 版块配置                    | rw    | r      | r      |
| 系统设置                    | rw    | -      | -      |
| 队列管理（开关/触发）             | rw    | r      | -      |
| 用户管理                    | rw    | -      | -      |
| 操作日志                    | r     | -      | -      |


## 13. 敏感配置处理


| 行为  | 普通配置    | 敏感配置 (isSecret: true)    |
| --- | ------- | ------------------------ |
| 读取  | 直接返回值   | 前端显示 `••••••••`，仅显示末 4 位 |
| 编辑  | 明文编辑    | 输入新值后 AES 加密存储           |
| 日志  | 记录变更前后值 | 仅记录"已更新"，不记录具体值          |
| 导出  | 可导出     | 排除或脱敏                    |


## 14. Audit Log 覆盖范围


| 类别   | 记录事件                                              |
| ---- | ------------------------------------------------- |
| 用户操作 | 登录/登出、审核 Feed、编辑内容、手动触发发帖                         |
| 配置变更 | Persona/Tone/Topic Rules/Forum/Config 的增删改        |
| 队列操作 | 队列启用/暂停/恢复、手动触发、失败任务重试                            |
| 系统事件 | Scanner 扫描完成、TrendPuller 拉取完成、发帖成功/失败、Gemini 调用失败 |
| 权限变更 | 用户角色变更、新增/删除用户                                    |


每条日志字段：时间、操作人（系统事件为 system）、操作类型、目标模块、目标 ID、变更前/后值、IP 地址。

## 15. API 设计

统一前缀 `/api/v1`，JWT 认证（除登录外）。

### Auth


| Method | Path                   | 说明                                                | 权限    |
| ------ | ---------------------- | ------------------------------------------------- | ----- |
| POST   | `/auth/login`          | 登录                                                | 公开    |
| POST   | `/auth/register`       | 注册                                                | Admin |
| GET    | `/auth/me`             | 当前用户信息                                            | 登录    |
| PUT    | `/auth/password`       | 修改密码                                              | 登录    |
| POST   | `/auth/refresh`        | 刷新 Access Token（用 Refresh Token 换取新 Access Token） | 公开    |
| POST   | `/auth/logout`         | 登出（Refresh Token 加入黑名单）                           | 登录    |
| GET    | `/auth/users`          | 用户列表                                              | Admin |
| PUT    | `/auth/users/:id/role` | 修改用户角色                                            | Admin |
| DELETE | `/auth/users/:id`      | 删除用户                                              | Admin |


### Feed


| Method | Path                     | 说明                                    | 权限      |
| ------ | ------------------------ | ------------------------------------- | ------- |
| GET    | `/feeds`                 | 列表（分页、筛选）                             | Editor+ |
| GET    | `/feeds/:id`             | 详情                                    | Editor+ |
| POST   | `/feeds/:id/approve`     | 批准                                    | Editor+ |
| POST   | `/feeds/:id/reject`      | 拒绝                                    | Editor+ |
| PUT    | `/feeds/:id/content`     | 编辑内容                                  | Editor+ |
| POST   | `/feeds/:id/post`        | 立即发帖                                  | Editor+ |
| POST   | `/feeds/:id/claim`       | 锁定 Feed（可配置过期时间，默认10分钟）               | Editor+ |
| POST   | `/feeds/:id/unclaim`     | 释放锁定                                  | Editor+ |
| POST   | `/feeds/:id/regenerate`  | 重新生成（可切换 Tone/Persona）                | Editor+ |
| POST   | `/feeds/custom-generate` | 自定义生成（手动输入主题，AI 生成新草稿）                | Editor+ |
| POST   | `/feeds/batch/approve`   | 批量批准                                  | Editor+ |
| POST   | `/feeds/batch/reject`    | 批量拒绝                                  | Editor+ |
| POST   | `/feeds/batch/post`      | 一键发帖所有已审批 Feed（poster 队列按 35s 间隔串行发出） | Editor+ |


### Scanner


| Method | Path               | 说明   | 权限      |
| ------ | ------------------ | ---- | ------- |
| GET    | `/scanner/history` | 扫描历史 | Editor+ |
| POST   | `/scanner/trigger` | 手动触发 | Admin   |


### Poster


| Method | Path                   | 说明      | 权限      |
| ------ | ---------------------- | ------- | ------- |
| GET    | `/poster/history`      | 发帖历史    | Editor+ |
| GET    | `/poster/accounts`     | BK 账号列表 | Admin   |
| PUT    | `/poster/accounts/:id` | 更新账号    | Admin   |


### Trends


| Method | Path              | 说明   | 权限      |
| ------ | ----------------- | ---- | ------- |
| GET    | `/trends`         | 趋势列表 | Editor+ |
| POST   | `/trends/trigger` | 手动触发 | Admin   |


### Persona


| Method | Path            | 说明  | 权限      |
| ------ | --------------- | --- | ------- |
| GET    | `/personas`     | 列表  | Editor+ |
| GET    | `/personas/:id` | 详情  | Editor+ |
| POST   | `/personas`     | 新增  | Admin   |
| PUT    | `/personas/:id` | 编辑  | Admin   |
| DELETE | `/personas/:id` | 删除  | Admin   |


### Tone Modes


| Method | Path         | 说明  | 权限      |
| ------ | ------------ | --- | ------- |
| GET    | `/tones`     | 列表  | Editor+ |
| GET    | `/tones/:id` | 详情  | Editor+ |
| POST   | `/tones`     | 新增  | Admin   |
| PUT    | `/tones/:id` | 编辑  | Admin   |
| DELETE | `/tones/:id` | 删除  | Admin   |


### Topic Rules


| Method | Path               | 说明  | 权限      |
| ------ | ------------------ | --- | ------- |
| GET    | `/topic-rules`     | 列表  | Editor+ |
| POST   | `/topic-rules`     | 新增  | Admin   |
| PUT    | `/topic-rules/:id` | 编辑  | Admin   |
| DELETE | `/topic-rules/:id` | 删除  | Admin   |


### Forum


| Method | Path                          | 说明                               | 权限      |
| ------ | ----------------------------- | -------------------------------- | ------- |
| GET    | `/forums`                     | 分类+版块树形列表                        | Editor+ |
| POST   | `/forums/categories`          | 新增分类                             | Admin   |
| PUT    | `/forums/categories/:id`      | 编辑分类                             | Admin   |
| POST   | `/forums/boards`              | 新增版块                             | Admin   |
| PUT    | `/forums/boards/:id`          | 编辑版块                             | Admin   |
| PUT    | `/forums/boards/:id/personas` | 更新版块-角色关联                        | Admin   |
| POST   | `/forums/sync`                | 自动从 BK 论坛 API 同步版块索引（fid、名称、帖子数） | Admin   |
| DELETE | `/forums/boards/:id`          | 删除版块                             | Admin   |


### Queue


| Method | Path                           | 说明     | 权限      |
| ------ | ------------------------------ | ------ | ------- |
| GET    | `/queues`                      | 所有队列状态 | Editor+ |
| GET    | `/queues/:name`                | 单个队列详情 | Editor+ |
| POST   | `/queues/:name/pause`          | 暂停     | Admin   |
| POST   | `/queues/:name/resume`         | 恢复     | Admin   |
| POST   | `/queues/:name/trigger`        | 手动触发   | Admin   |
| GET    | `/queues/:name/jobs`           | 执行历史   | Editor+ |
| POST   | `/queues/:name/jobs/:id/retry` | 重试     | Admin   |


### Config


| Method | Path                 | 说明    | 权限    |
| ------ | -------------------- | ----- | ----- |
| GET    | `/configs`           | 全部配置  | Admin |
| GET    | `/configs/:category` | 按分类获取 | Admin |
| PUT    | `/configs/:key`      | 更新配置  | Admin |


### Dashboard


| Method | Path                  | 说明      | 权限      |
| ------ | --------------------- | ------- | ------- |
| GET    | `/dashboard/realtime` | 实时数据    | Editor+ |
| GET    | `/dashboard/today`    | 今日统计    | Editor+ |
| GET    | `/dashboard/recent`   | 最近动态    | Editor+ |
| GET    | `/dashboard/weekly`   | 近 7 天趋势 | Editor+ |


### Audit


| Method | Path      | 说明   | 权限    |
| ------ | --------- | ---- | ----- |
| GET    | `/audits` | 日志列表 | Admin |


### Health


| Method | Path      | 说明                                    | 权限  |
| ------ | --------- | ------------------------------------- | --- |
| GET    | `/health` | 系统健康检查（MongoDB/Redis 连接状态、外部 API 连通性） | 公开  |


### 通用规范

- 分页: `?page=1&limit=20`
- 排序: `?sort=-createdAt`
- 筛选: `?status=pending&boardFid=162`
- 成功响应: `{ success: true, data: {}, pagination: {} }`
- 错误响应: `{ success: false, error: { code, message } }`

## 16. Docker Compose 服务

```yaml
services:
  frontend:   # Vue 3 + Nginx, port 80
  backend:    # Express API + Socket.io, port 3000
  worker:     # BullMQ Worker + node-cron
  mongodb:    # MongoDB 7, port 27017
  redis:      # Redis 7, port 6379
```

所有服务通过内部网络通信，仅 frontend 和 backend 暴露端口。

## 17. API 文档自动生成

使用 Swagger/OpenAPI 自动生成可交互的 API 文档。

**技术方案：**

- `swagger-jsdoc` — 在每个 route 文件中用 JSDoc 注释定义 API 描述
- `swagger-ui-express` — 挂载到 `/api/docs`，提供可视化文档界面

**文档内容：**

- 每个 API 的请求方法、路径、参数定义
- 请求体 Schema（含必填/选填、类型、示例值）
- 响应格式 Schema（成功/错误）
- 权限要求（Admin/Editor/Viewer）
- 按模块分组（Auth、Feed、Scanner、Poster 等）

**访问方式：**

- 开发环境：`http://localhost:3000/api/docs`
- 支持在线调试（Try it out），自动带上 JWT token

## 18. 国际化（i18n）

使用 `vue-i18n` 实现前端双语支持（繁體中文 / English）。

- 语言文件按模块组织：`locales/zh-HK/feed.json`、`locales/en/feed.json`
- 用户在界面右上角切换语言，选择保存到用户偏好
- 默认语言：繁體中文（locale code: `zh-HK`）
- Element Plus 自身 locale 通过 `ElConfigProvider` 的 `locale` prop 同步切换
- **v1.0 仅实现繁體中文**，英文支持标记为 v1.1

## 19. 统一错误处理策略

### 后端错误处理

全局错误中间件，所有模块抛出的错误统一捕获处理：


| 错误类型    | HTTP 状态码 | 处理方式          |
| ------- | -------- | ------------- |
| 参数校验失败  | 400      | 返回具体字段错误信息    |
| 未认证     | 401      | 返回登录页         |
| 权限不足    | 403      | 返回无权限提示       |
| 资源不存在   | 404      | 返回未找到         |
| 业务逻辑错误  | 422      | 返回业务错误码 + 描述  |
| 服务器内部错误 | 500      | 记录日志，返回通用错误信息 |


### 外部 API 调用重试策略


| 外部服务              | 重试次数 | 重试间隔               | 失败处理                             |
| ----------------- | ---- | ------------------ | -------------------------------- |
| Gemini API        | 3 次  | 指数退避（1s, 2s, 4s）   | 标记 Feed 为 failed，记录错误到 audit log |
| BK Forum API      | 2 次  | 固定 32s（匹配 BK 限频间隔） | 标记 Feed 为 failed，记录错误            |
| MediaLens API     | 3 次  | 指数退避               | 跳过本轮拉取，下次定时任务重新拉取                |
| Google Trends API | 2 次  | 固定 3s              | 跳过热点注入，仍正常生成回复（降级）               |


### 前端错误处理

- Axios 响应拦截器统一处理：
  - 401 → 自动跳转登录页
  - 403 → Element Plus 弹窗提示无权限
  - 422/400 → 表单字段级错误提示
  - 500 → 全局 ElNotification 错误通知
- 网络断开 → 顶部横幅提示连接已断开，自动重连

## 20. 环境配置

### 三套环境


| 环境          | 用途   | MongoDB         | Redis          |
| ----------- | ---- | --------------- | -------------- |
| development | 本地开发 | localhost:27017 | localhost:6379 |
| staging     | 测试验证 | Docker 内部       | Docker 内部      |
| production  | 正式运行 | Docker 内部       | Docker 内部      |


### .env 文件结构

```
.env.development    # 本地开发
.env.staging        # 测试环境
.env.production     # 生产环境
.env.example        # 模板（提交到 git，不含真实值）
```

### .env 内容

```bash
# 基础
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# MongoDB
MONGO_URI=mongodb://localhost:27017/baby-kingdom

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# 加密（用于 isSecret 配置项的 AES 加密）
ENCRYPTION_KEY=your-32-char-encryption-key

# 初始 Admin 账号（首次启动自动创建）
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me
```

### Docker Compose 多环境

```
docker-compose.yml              # 基础配置
docker-compose.staging.yml      # staging 覆盖
docker-compose.production.yml   # production 覆盖
```

业务配置（Gemini Key、BK 论坛参数等）全部在 Admin 后台的 Config 页面管理，存在 MongoDB 中。`.env` 只放基础设施配置（数据库连接、JWT、加密密钥等）。`.env` 文件不提交 git，只提交 `.env.example`。

## 21. UI 设计

使用 Figma Make 生成 Admin 后台 UI 草稿，涵盖：

- 登录页
- Dashboard 仪表盘
- 侧边栏菜单布局
- 各模块的列表页、编辑页
- 队列监控面板

UI 草稿确认后作为前端开发参考。

## 22. MediaLens OTP 认证

MediaLens API 使用 OTP（一次性密码）邮箱认证获取 JWT Token。

### 认证流程

```
1. 发送 OTP 请求 → MediaLens 发送验证码到 MEDIALENS_AUTH_EMAIL
2. 用户在 Admin 后台输入收到的验证码
3. 后端用验证码换取 JWT Token
4. Token 存入 configs（MEDIALENS_JWT_TOKEN，加密存储）
5. 后续 API 调用自动附带 JWT Token
```

### Token 管理

- Worker 定时检查 Token 有效期（ml-token-refresh 队列，每 12 小时）
- Token 即将过期时通过 Socket.io 通知 Admin 前端
- Admin 在后台手动触发 OTP 认证流程刷新 Token
- 认证成功/失败记录到 Audit Log（ML_AUTH_SUCCESS / ML_AUTH_FAILED）

### API


| Method | Path                             | 说明                 | 权限    |
| ------ | -------------------------------- | ------------------ | ----- |
| POST   | `/trends/medialens/request-otp`  | 发送 OTP 验证码         | Admin |
| POST   | `/trends/medialens/verify-otp`   | 验证 OTP 并获取 JWT     | Admin |
| GET    | `/trends/medialens/token-status` | 查看当前 Token 状态和过期时间 | Admin |


## 23. JWT 双 Token 认证

### 机制


| Token         | 有效期   | 存储位置              | 用途               |
| ------------- | ----- | ----------------- | ---------------- |
| Access Token  | 30 分钟 | 前端内存（Pinia store） | API 请求认证         |
| Refresh Token | 7 天   | HttpOnly Cookie   | 换取新 Access Token |


### 流程

- 登录成功：返回 Access Token + 设置 Refresh Token Cookie
- Access Token 过期：前端自动调用 `POST /auth/refresh` 换取新 Token（无感续期）
- Refresh Token 过期：跳转登录页
- 登出：`POST /auth/logout` 将 Refresh Token 加入 Redis 黑名单
- 角色变更/用户删除：主动使该用户所有 Refresh Token 失效

## 24. 内容质量守卫

在 Feed 写入 PENDING 状态前，自动执行以下质量检测：

### 检测规则


| 检测项   | 方式                                                | 处理                                |
| ----- | ------------------------------------------------- | --------------------------------- |
| 内容重复  | 与最近 24h 同 Persona 已生成内容做文本相似度比对（阈值 0.85）          | 标记为疑似重复，仍进入 PENDING 但加 warning 标签 |
| 字数范围  | 检查是否在 SHORT/MEDIUM/LONG_POST_MAX_CHARS 范围内        | 超出则截断或重新生成                        |
| AI 痕迹 | 检查是否包含"作为一个AI"、"我是语言模型"等模板痕迹                      | 自动过滤并重新生成                         |
| 口头禅覆盖 | 检查回复是否包含该 Persona 的至少 1 个 catchphrase 或 voice cue | 仅记录，不阻断                           |
| 格式异常  | 检查是否全空、全标点、或明显乱码                                  | 丢弃，记录错误到 audit log                |


### Dashboard 质量指标

- 审核通过率（approved / total reviewed）
- 平均审核时长
- 重复内容拦截数
- 各 Persona 被拒率排行

## 25. 前端权限体系

### 路由级守卫

Vue Router `meta.requiredRole` + 全局 `beforeEach` 守卫：

```javascript
// 路由定义
{ path: '/config', meta: { requiredRole: 'admin' } }
{ path: '/feeds', meta: { requiredRole: 'editor' } }
{ path: '/dashboard', meta: { requiredRole: 'viewer' } }
```

- Viewer 访问 Editor 页面 → 重定向到 Dashboard
- 未登录访问任何页面 → 重定向到 Login

### 组件级权限

封装 `v-permission` 自定义指令：

- `v-permission="'admin'"` — 仅 Admin 可见
- `v-permission="'editor'"` — Editor 和 Admin 可见
- Viewer 看不到编辑/审核按钮，只能查看数据

### Socket.io Room 机制

- 进入页面时 join 对应 room（如 `room:feed`、`room:queue`）
- 离开页面时 leave room
- 服务端按 room 推送，避免全量广播
- 封装 `useSocketRoom(roomName)` composable 管理生命周期

## 26. Docker 生产环境加固

### 健康检查

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
  worker:
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
  mongodb:
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
```

### 容器策略


| 策略                | 配置                                                       |
| ----------------- | -------------------------------------------------------- |
| 重启策略              | 所有容器 `restart: unless-stopped`                           |
| 启动顺序              | `depends_on` + `condition: service_healthy`              |
| Graceful Shutdown | Backend/Worker 捕获 SIGTERM，等待当前任务完成后退出                    |
| 镜像版本锁定            | `mongo:7.0.14`、`redis:7.4.1`、`node:20-alpine`（不用 latest） |


### 数据持久化

```yaml
volumes:
  mongo-data:     # MongoDB 数据
  redis-data:     # Redis AOF 持久化
```

- Redis 开启 AOF（`appendonly yes`），防止 BullMQ 任务丢失
- Named volumes 明确声明，`docker-compose down` 不会删除数据

### 网络隔离

```yaml
networks:
  frontend-net:   # frontend <-> backend
  backend-net:    # backend <-> worker <-> mongodb <-> redis
```

- Frontend（Nginx）只能访问 Backend，不能直接访问 MongoDB/Redis
- Worker 只在 backend-net，不暴露端口

### 资源限制

生产环境 override 文件中设置 CPU 和内存上限，防止单容器耗尽宿主机资源。

### 监控告警（最小方案）

- Backend/Worker 集成 `prom-client`，暴露 `/metrics` 端点
- Prometheus 采集 + Grafana 面板展示
- 关键告警项：Worker down、Gemini API 错误率 > 10%、待审核 Feed 堆积 > 200、MongoDB 连接失败、Redis 内存 > 80%

## 27. 降级运行模式

当外部依赖不可用时的系统行为：


| 依赖故障                      | 影响范围                       | 降级行为                                                  |
| ------------------------- | -------------------------- | ----------------------------------------------------- |
| **Gemini API 不可用**        | Scanner、TrendPuller 无法生成内容 | 自动暂停 scanner/trends 队列，推送告警到 Dashboard，已审批的 Feed 仍可发帖 |
| **BK Forum API 不可用**      | 无法发帖和扫描                    | Feed 保持 APPROVED 状态不发帖，scanner 暂停，恢复后 poster 自动重试     |
| **MediaLens API 不可用**     | TrendPuller 无法拉取趋势         | 跳过 MediaLens 源，仅依赖 Scanner + Google Trends            |
| **Google Trends API 不可用** | 无法注入热点上下文                  | 跳过热点注入，正常生成回复（降级，不阻断）                                 |
| **Redis 不可用**             | 队列和实时推送全部失效                | Backend 降级为纯 REST API 模式，前端回退到轮询                      |


连续失败 5 次的外部 API 自动触发队列暂停 + Dashboard 告警。

## 28. Worker 高可用

### cron 调度与任务消费解耦

- **Scheduler 进程**：只负责按 cron 规则往 BullMQ 队列中投递任务
- **Worker 进程**：只负责从队列中消费和执行任务
- 支持 `docker-compose up --scale worker=2` 水平扩展
- node-cron Scheduler 使用 Redis 分布式锁确保只有一个实例运行（leader election）

### BullMQ Poster 队列串行控制

Poster 队列配置 `concurrency: 1` + `limiter: { max: 1, duration: 35000 }`，确保全局 35 秒间隔串行发帖，即使多 Worker 实例也不会并发发帖。

## 29. v1.1 Backlog

```javascript
fb-viral
```

以下功能不纳入 v1.0，标记为后续版本：


| #   | 功能                   | 说明                                           |
| --- | -------------------- | -------------------------------------------- |
| 1   | 英文 i18n              | v1.0 仅繁體中文，v1.1 补充英文                         |
| 2   | 发帖效果回收               | 定时回查已发布帖子的回复数/浏览数，评估 Persona+Tone 效果         |
| 3   | Google Trends 语义匹配   | 用 Gemini Embedding API 替代关键词匹配               |
| 4   | 配置向导（Wizard）         | 新增 Persona/版块的引导式配置流程                        |
| 5   | 操作快捷键                | Feed 审核页 A=Approve, R=Reject, N=Next, E=Edit |
| 6   | 常用编辑片段               | 运营人员保存常用修改模板                                 |
| 7   | A/B 测试               | 对比不同 Persona+Tone 组合的发帖效果                    |
| 8   | personaBindings 独立集合 | 从 forumBoards 嵌入数组拆为独立集合（v1.0 先用嵌入方案）        |
| 9   | CI/CD Pipeline       | GitHub Actions: lint → test → build → deploy |
| 10  | MongoDB 备份自动化        | mongodump 定时备份到对象存储，7 天滚动                    |


