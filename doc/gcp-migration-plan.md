# GCP 全原生迁移方案 — Baby Kingdom Admin

> 日期: 2026-04-10
> 状态: 草案，待评审
> 基于: gcp-deployment-analysis.md + 代码库实际盘点

---

## 目标架构

```
┌─ Internet ──────────────────────────────────────────────────────┐
│                                                                  │
│  admin.domain.com  → Cloud Run (Backend API, 纯 REST)            │
│  domain.com        → Cloud Storage + CDN (Frontend SPA)          │
│                                                                  │
└──────┬──────────────────────────────────────┬───────────────────┘
       │                                      │
┌──────▼──────────────┐          ┌────────────▼────────────────┐
│ Cloud Run — Backend  │          │ Cloud Storage + CDN          │
│  /api/v1/* (65+ API) │          │  Vue 3 SPA 静态资源           │
│  POST /queues/trigger│          │  index.html + assets/        │
│  (手动触发入口)       │          └─────────────────────────────┘
└──────┬──────────────┘
       │ 创建 Cloud Task
       ▼
┌────────────────────────────────────────────────────────────┐
│ Cloud Scheduler (6 cron)     Cloud Tasks (6 queues)        │
│  */5m  → scanner              poster:  1/35s, concurrent=1 │
│  60m   → trends               scanner: concurrent=1        │
│  0 16  → daily-reset          trends:  concurrent=1        │
│  5 *   → stats                daily-reset, stats, gtrends  │
│  30m   → gtrends                                           │
│  */5m  → health               ─────────────────────→       │
└───────────────────────────────┬────────────────────────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │ Cloud Run — Worker      │
                   │  POST /tasks/scanner    │
                   │  POST /tasks/trends     │
                   │  POST /tasks/poster     │
                   │  POST /tasks/daily-reset│
                   │  POST /tasks/stats      │
                   │  POST /tasks/gtrends    │
                   │  (无状态 HTTP handler)   │
                   └────────────┬───────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │ Cloud SQL (PostgreSQL)  │
                   │  15-18 张关系表          │
                   │  Prisma ORM             │
                   │  自动备份, IAM 认证      │
                   └────────────────────────┘

 ❌ 无 Redis        ❌ 无 Socket.io
 ❌ 无 BullMQ       ❌ 无 Leader Election
 ❌ 无 MongoDB      ❌ 无 VM
```

### 技术选型确认

| 组件 | 当前 | 目标 GCP 服务 | 理由 |
|---|---|---|---|
| 计算 (API) | Express 容器 | **Cloud Run** | 纯 REST，按需扩缩，低流量极便宜 |
| 计算 (Worker) | BullMQ 进程 | **Cloud Run** (HTTP) | 无状态 handler，Cloud Tasks 触发 |
| 定时任务 | node-cron + Redis 锁 | **Cloud Scheduler** | 全托管，天然单实例，无需 leader election |
| 任务队列 | BullMQ + Redis | **Cloud Tasks** | 原生 rate limit + concurrency，免费额度大 |
| 数据库 | MongoDB 7 + Mongoose | **Cloud SQL PostgreSQL + Prisma** | GCP 原生，Cloud Run 零配置连接 |
| 前端 | Nginx 容器 | **Cloud Storage + CDN** | 纯静态，最便宜，全球加速 |
| CI/CD | 无 | **Cloud Build** | GCP 原生，免费额度够用 |
| 密钥 | .env 文件 | **Secret Manager** | Cloud Run 原生支持，IAM 控制 |

---

## 代码库现状盘点

### 后端模块 (15 个)

| 模块 | Model | Service | Controller | Routes | 复杂度 |
|---|---|---|---|---|---|
| feed | 140 行, 38 字段, 6 索引 | 500 行, ~12 DB ops | ✅ | ✅ | **高** |
| poster | — | 508 行, ~9 DB ops | ✅ | ✅ | **高** |
| scanner | — | 330 行, ~9 DB ops | ✅ | ✅ | **高** |
| auth | 74 行 | 168 行, ~8 DB ops | ✅ | ✅ | 中 |
| trends | 45 行 | 244 行, ~8 DB ops | ✅ | ✅ | 中 |
| dashboard | 115 行 | 149 行, ~8 DB ops | ✅ | ✅ | 中 |
| config | 35 行 | 123 行, ~7 DB ops | ✅ | ✅ | 中 |
| queue | 48 行 | 178 行, ~6 DB ops | ✅ | ✅ | 中 |
| google-trends | 71 行 | 121 行, ~6 DB ops | ✅ | ✅ | 中 |
| forum | 92 行 | 81 行, ~4 DB ops | ✅ | ✅ | 中 |
| persona | 84 行 | (crud) | — | ✅ | 低 |
| tone | 41 行 | (crud) | — | ✅ | 低 |
| topic-rules | 39 行 | (crud) | — | ✅ | 低 |
| audit | 49 行 | 58 行, ~2 DB ops | ✅ | ✅ | 低 |
| health | — | — | ✅ | ✅ | 低 |
| gemini | — | 108+342 行 | — | — | 内部 |

### 关键数字

| 指标 | 数量 |
|---|---|
| Mongoose Models | 13 个 |
| Schema 字段总计 | ~350+ |
| 复合索引 | 12 个 |
| TTL 索引 | 1 个 (AuditLog 90 天) |
| Mongoose DB 操作 | ~85+ 处 |
| Service 代码总量 | ~3,010 行 |
| Redis 操作 | ~25 处 (8 个文件) |
| BullMQ 队列 | 6 个 |
| Cron Jobs | 6 个 |
| 集成测试 | 213 个 |
| shared/crud.ts | 5 个通用函数, 被 ~5 个简单模块使用 |

---

## 迁移分 4 个 Phase

### 总览

```
Phase 1: 数据库迁移 (MongoDB → Cloud SQL + Prisma)     ~12-15 天
Phase 2: 队列/定时迁移 (BullMQ/Redis → Cloud Tasks)     ~5-6 天
Phase 3: GCP 基础设施搭建 + 部署                         ~3-4 天
Phase 4: 前端适配 + 端到端验证                            ~2-3 天
                                                  合计: ~22-28 天
```

> Phase 1 和 Phase 2 可部分并行（不同开发者），实际可压缩到 ~18-22 天。

---

## Phase 1: 数据库迁移 — MongoDB → Cloud SQL + Prisma

> 这是最大的改造模块，占总工作量 ~55%

### 1.1 PostgreSQL Schema 设计

#### 表结构映射（13 Model → 18 张表）

```sql
-- ============================================
-- 1. users (← auth.model.ts User)
-- ============================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,  -- lowercase
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'editor', 'viewer')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. configs (← config.model.ts Config)
-- ============================================
CREATE TABLE configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(100) UNIQUE NOT NULL,
  value       TEXT NOT NULL DEFAULT '',
  category    VARCHAR(20) NOT NULL
              CHECK (category IN ('gemini','bk-forum','medialens',
                     'google-trends','scanner','email','general')),
  description TEXT DEFAULT '',
  is_secret   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by  VARCHAR(100) DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. tone_modes (← tone.model.ts ToneMode)
-- ============================================
CREATE TABLE tone_modes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tone_id           VARCHAR(50) UNIQUE NOT NULL,
  display_name      VARCHAR(100) NOT NULL,
  -- 6+ tone descriptor fields (保持原有字段)
  warmth            VARCHAR(50) DEFAULT '',
  formality         VARCHAR(50) DEFAULT '',
  humor             VARCHAR(50) DEFAULT '',
  empathy           VARCHAR(50) DEFAULT '',
  directness        VARCHAR(50) DEFAULT '',
  enthusiasm        VARCHAR(50) DEFAULT '',
  suitable_for_tier3 BOOLEAN NOT NULL DEFAULT FALSE,
  override_priority  INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. personas (← persona.model.ts Persona)
-- ============================================
CREATE TABLE personas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        VARCHAR(50) UNIQUE NOT NULL,
  username          VARCHAR(100) NOT NULL,
  archetype         VARCHAR(20) NOT NULL
                    CHECK (archetype IN ('experienced_mom','new_mom',
                           'professional','community_elder')),
  -- tone 引用
  primary_tone_id   VARCHAR(50) REFERENCES tone_modes(tone_id),
  secondary_tone_ids TEXT[] DEFAULT '{}',
  -- voice 特征
  vocabulary        TEXT[] DEFAULT '{}',
  sentence_patterns TEXT[] DEFAULT '{}',
  emoji_style       VARCHAR(50) DEFAULT '',
  -- BK 论坛凭据 (AES 加密)
  bk_password_enc   TEXT DEFAULT '',
  bk_token          TEXT DEFAULT '',
  bk_token_expires  TIMESTAMPTZ,
  -- 发帖统计
  posts_today       INTEGER NOT NULL DEFAULT 0,
  posts_total       INTEGER NOT NULL DEFAULT 0,
  daily_limit       INTEGER NOT NULL DEFAULT 10,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 5. topic_rules (← topic-rules.model.ts TopicRule)
-- ============================================
CREATE TABLE topic_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id             VARCHAR(50) UNIQUE NOT NULL,
  topic_keywords      TEXT[] DEFAULT '{}',
  sensitivity_tier    INTEGER NOT NULL DEFAULT 1 CHECK (sensitivity_tier IN (1,2,3)),
  sentiment_trigger   VARCHAR(20) DEFAULT '',
  priority_account_ids TEXT[] DEFAULT '{}',
  assign_tone_mode    VARCHAR(50) DEFAULT '',
  post_type_preference VARCHAR(20) DEFAULT '',
  gemini_prompt_hint  TEXT DEFAULT '',
  avoid_if            TEXT DEFAULT '',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 6. forum_categories (← forum.model.ts ForumCategory)
-- ============================================
CREATE TABLE forum_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 7. forum_boards (← forum.model.ts ForumBoard)
-- ============================================
CREATE TABLE forum_boards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID REFERENCES forum_categories(id) ON DELETE SET NULL,
  name              VARCHAR(100) NOT NULL,
  fid               INTEGER UNIQUE NOT NULL,
  enable_scraping   BOOLEAN NOT NULL DEFAULT FALSE,
  enable_auto_reply BOOLEAN NOT NULL DEFAULT FALSE,
  reply_threshold_min INTEGER NOT NULL DEFAULT 0,
  reply_threshold_max INTEGER NOT NULL DEFAULT 5,
  scan_interval     INTEGER NOT NULL DEFAULT 30,  -- minutes
  default_tone_mode VARCHAR(50) DEFAULT '',
  default_rule_ids  TEXT[] DEFAULT '{}',
  exclude_rule_ids  TEXT[] DEFAULT '{}',
  last_scanned_at   TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7a. board_persona_bindings (拆出 ForumBoard.personaBindings 子文档)
CREATE TABLE board_persona_bindings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES forum_boards(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  priority   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(board_id, persona_id)
);

-- ============================================
-- 8. google_trends (← google-trends.model.ts GoogleTrend)
-- ============================================
CREATE TABLE google_trends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query           VARCHAR(500) UNIQUE NOT NULL,
  score           INTEGER NOT NULL DEFAULT 0,
  peak_volume     INTEGER DEFAULT 0,
  duration_hours  REAL DEFAULT 0,
  categories      TEXT[] DEFAULT '{}',
  trend_breakdown JSONB DEFAULT '[]',   -- 保持 JSON，结构不固定
  analysis        JSONB DEFAULT '{}',   -- 嵌套分析结果
  pull_id         VARCHAR(100) DEFAULT '',
  pulled_at       TIMESTAMPTZ,
  geo             VARCHAR(10) DEFAULT 'HK',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gtrends_pull ON google_trends(pull_id);
CREATE INDEX idx_gtrends_pulled_at ON google_trends(pulled_at DESC);

-- 8a. google_trend_news (拆出 GoogleTrend.news[] 子文档)
CREATE TABLE google_trend_news (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id  UUID NOT NULL REFERENCES google_trends(id) ON DELETE CASCADE,
  title     TEXT DEFAULT '',
  source    VARCHAR(200) DEFAULT '',
  url       TEXT DEFAULT '',
  snippet   TEXT DEFAULT '',
  published_at TIMESTAMPTZ
);

-- ============================================
-- 9. feeds (← feed.model.ts Feed) — 最复杂
-- ============================================
CREATE TABLE feeds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id           VARCHAR(50) UNIQUE NOT NULL,
  type              VARCHAR(20) NOT NULL DEFAULT 'reply',
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','posted','failed')),
  -- source 信息
  source_type       VARCHAR(20) DEFAULT '',     -- 'trend' | 'scanner' | 'manual'
  source_trend_id   UUID REFERENCES trends(id) ON DELETE SET NULL,
  source_scan_id    VARCHAR(100) DEFAULT '',
  -- thread 信息 (scanner 来源)
  thread_tid        VARCHAR(50) DEFAULT '',
  thread_fid        INTEGER DEFAULT 0,
  thread_subject    TEXT DEFAULT '',
  thread_author     VARCHAR(100) DEFAULT '',
  thread_replies    INTEGER DEFAULT 0,
  thread_content    TEXT DEFAULT '',
  -- trend 信息 (trends 来源)
  trend_topic       VARCHAR(500) DEFAULT '',
  trend_summary     TEXT DEFAULT '',
  -- persona 关联
  persona_id        UUID REFERENCES personas(id) ON DELETE SET NULL,
  persona_username  VARCHAR(100) DEFAULT '',
  -- 生成内容
  generated_title   TEXT DEFAULT '',
  generated_content TEXT NOT NULL DEFAULT '',
  tone_used         VARCHAR(50) DEFAULT '',
  -- 评估分数
  eval_relevance    REAL DEFAULT 0,
  eval_quality      REAL DEFAULT 0,
  eval_sensitivity  INTEGER DEFAULT 1,
  -- Google Trends 信息
  google_trends_data JSONB DEFAULT '{}',
  -- 发帖结果
  post_id           VARCHAR(100) DEFAULT '',
  posted_at         TIMESTAMPTZ,
  post_error        TEXT DEFAULT '',
  post_attempts     INTEGER NOT NULL DEFAULT 0,
  -- 审核
  claimed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at        TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT DEFAULT '',
  -- 质量
  quality_warnings  TEXT[] DEFAULT '{}',
  is_duplicate      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_feeds_status_created ON feeds(status, created_at DESC);
CREATE INDEX idx_feeds_persona_status ON feeds(persona_id, status);
CREATE INDEX idx_feeds_fid_status ON feeds(thread_fid, status);
CREATE INDEX idx_feeds_claimed ON feeds(claimed_by, claimed_at);
CREATE INDEX idx_feeds_source ON feeds(source_type, created_at DESC);
CREATE UNIQUE INDEX idx_feeds_thread_persona ON feeds(thread_tid, persona_id)
  WHERE thread_tid IS NOT NULL AND thread_tid != '';

-- 9a. feed_sources (如果一个 feed 有多个 source)
-- 注意: 需确认 source 是数组还是单值。如果是单值，上面的扁平化已够用。

-- ============================================
-- 10. trends (← trends.model.ts Trend)
-- ============================================
CREATE TABLE trends (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id          VARCHAR(100) NOT NULL,
  source           VARCHAR(20) NOT NULL
                   CHECK (source IN ('medialens','lihkg','facebook')),
  rank             INTEGER NOT NULL DEFAULT 0,
  topic_label      VARCHAR(500) NOT NULL,
  summary          TEXT DEFAULT '',
  engagements      INTEGER DEFAULT 0,
  post_count       INTEGER DEFAULT 0,
  sensitivity_tier INTEGER DEFAULT 1,
  sentiment_score  REAL DEFAULT 0,
  sentiment_label  VARCHAR(20) DEFAULT '',
  raw_data         JSONB DEFAULT '{}',
  feed_ids         UUID[] DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, topic_label)
);
CREATE INDEX idx_trends_source_created ON trends(source, created_at DESC);

-- ============================================
-- 11. queue_jobs (← queue.model.ts QueueJob)
-- ============================================
CREATE TABLE queue_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name      VARCHAR(30) NOT NULL
                  CHECK (queue_name IN ('scanner','trends','poster',
                         'daily-reset','stats-aggregator','google-trends')),
  job_id          VARCHAR(100) DEFAULT '',
  status          VARCHAR(20) NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting','active','completed','failed')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER DEFAULT 0,
  result          JSONB DEFAULT '{}',
  error           TEXT DEFAULT '',
  triggered_by    VARCHAR(20) DEFAULT 'cron',
  triggered_by_user VARCHAR(100) DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_qjobs_queue_status ON queue_jobs(queue_name, status, created_at DESC);

-- ============================================
-- 12. daily_stats (← dashboard.model.ts DailyStats)
-- ============================================
CREATE TABLE daily_stats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE UNIQUE NOT NULL,      -- YYYY-MM-DD
  -- 用 JSONB 存嵌套统计（结构经常变化，JSONB 更灵活）
  scanner     JSONB NOT NULL DEFAULT '{}',
  feeds       JSONB NOT NULL DEFAULT '{}',
  trends      JSONB NOT NULL DEFAULT '{}',
  posts       JSONB NOT NULL DEFAULT '{}',
  by_board    JSONB NOT NULL DEFAULT '[]',
  by_persona  JSONB NOT NULL DEFAULT '[]',
  gemini      JSONB NOT NULL DEFAULT '{}',
  quality     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 13. audit_logs (← audit.model.ts AuditLog)
-- ============================================
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator      VARCHAR(100) NOT NULL DEFAULT '',
  event_type    VARCHAR(50) NOT NULL,
  module        VARCHAR(20) NOT NULL
                CHECK (module IN ('auth','config','persona','tone',
                       'topic-rule','board','feed','scanner',
                       'trends','poster','queue','dashboard')),
  feed_id       VARCHAR(50) DEFAULT '',
  target_id     VARCHAR(100) DEFAULT '',
  bk_username   VARCHAR(100) DEFAULT '',
  action_detail TEXT DEFAULT '',
  before_data   JSONB DEFAULT NULL,
  after_data    JSONB DEFAULT NULL,
  api_status    INTEGER DEFAULT 0,
  ip            VARCHAR(50) DEFAULT '',
  session       VARCHAR(20) DEFAULT 'web'
                CHECK (session IN ('web','api','cron')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_module_created ON audit_logs(module, created_at DESC);

-- TTL 替代: 用 pg_cron 或 Cloud Scheduler 定期清理
-- DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
```

#### Schema 设计决策说明

| 决策 | 选择 | 原因 |
|---|---|---|
| 主键类型 | UUID | 分布式友好，无序列竞争 |
| 嵌套文档 → ? | 视情况拆表或用 JSONB | 需要查询/索引的拆表，纯存储的用 JSONB |
| DailyStats 内部 | JSONB | 统计结构经常变化，JSONB 最灵活 |
| Feed.source | 扁平化为 source_type + source_trend_id + source_scan_id | 避免多态子文档 |
| Feed.generatedReplies | 如果是数组需拆表；如果只有最终版 → 扁平化 | 需确认实际使用 |
| google_trends.news[] | 拆为 google_trend_news 表 | 需要按 news 查询 |
| google_trends.trend_breakdown | JSONB | 结构不固定，纯展示 |
| audit_logs TTL | Cloud Scheduler + DELETE | PostgreSQL 无原生 TTL |

### 1.2 Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          String    @id @default(uuid()) @db.Uuid
  username    String    @unique @db.VarChar(50)
  email       String    @unique @db.VarChar(255)
  passwordHash String  @map("password_hash") @db.VarChar(255)
  role        String    @default("viewer") @db.VarChar(10)
  lastLoginAt DateTime? @map("last_login_at") @db.Timestamptz()
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  claimedFeeds  Feed[] @relation("ClaimedFeeds")
  reviewedFeeds Feed[] @relation("ReviewedFeeds")

  @@map("users")
}

model Config {
  id          String   @id @default(uuid()) @db.Uuid
  key         String   @unique @db.VarChar(100)
  value       String   @default("") @db.Text
  category    String   @db.VarChar(20)
  description String   @default("") @db.Text
  isSecret    Boolean  @default(false) @map("is_secret")
  updatedBy   String   @default("") @map("updated_by") @db.VarChar(100)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("configs")
}

model ToneMode {
  id               String  @id @default(uuid()) @db.Uuid
  toneId           String  @unique @map("tone_id") @db.VarChar(50)
  displayName      String  @map("display_name") @db.VarChar(100)
  warmth           String  @default("") @db.VarChar(50)
  formality        String  @default("") @db.VarChar(50)
  humor            String  @default("") @db.VarChar(50)
  empathy          String  @default("") @db.VarChar(50)
  directness       String  @default("") @db.VarChar(50)
  enthusiasm       String  @default("") @db.VarChar(50)
  suitableForTier3 Boolean @default(false) @map("suitable_for_tier3")
  overridePriority Int     @default(0) @map("override_priority")
  isActive         Boolean @default(true) @map("is_active")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("tone_modes")
}

model Persona {
  id              String    @id @default(uuid()) @db.Uuid
  accountId       String    @unique @map("account_id") @db.VarChar(50)
  username        String    @db.VarChar(100)
  archetype       String    @db.VarChar(20)
  primaryToneId   String?   @map("primary_tone_id") @db.VarChar(50)
  secondaryToneIds String[] @default([]) @map("secondary_tone_ids")
  vocabulary      String[]  @default([])
  sentencePatterns String[] @default([]) @map("sentence_patterns")
  emojiStyle      String    @default("") @map("emoji_style") @db.VarChar(50)
  bkPasswordEnc   String    @default("") @map("bk_password_enc") @db.Text
  bkToken         String    @default("") @map("bk_token") @db.Text
  bkTokenExpires  DateTime? @map("bk_token_expires") @db.Timestamptz()
  postsToday      Int       @default(0) @map("posts_today")
  postsTotal      Int       @default(0) @map("posts_total")
  dailyLimit      Int       @default(10) @map("daily_limit")
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  feeds           Feed[]
  boardBindings   BoardPersonaBinding[]

  @@map("personas")
}

model TopicRule {
  id                String   @id @default(uuid()) @db.Uuid
  ruleId            String   @unique @map("rule_id") @db.VarChar(50)
  topicKeywords     String[] @default([]) @map("topic_keywords")
  sensitivityTier   Int      @default(1) @map("sensitivity_tier")
  sentimentTrigger  String   @default("") @map("sentiment_trigger") @db.VarChar(20)
  priorityAccountIds String[] @default([]) @map("priority_account_ids")
  assignToneMode    String   @default("") @map("assign_tone_mode") @db.VarChar(50)
  postTypePreference String  @default("") @map("post_type_preference") @db.VarChar(20)
  geminiPromptHint  String   @default("") @map("gemini_prompt_hint") @db.Text
  avoidIf           String   @default("") @map("avoid_if") @db.Text
  isActive          Boolean  @default(true) @map("is_active")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("topic_rules")
}

model ForumCategory {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @db.VarChar(100)
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  boards ForumBoard[]

  @@map("forum_categories")
}

model ForumBoard {
  id                String    @id @default(uuid()) @db.Uuid
  categoryId        String?   @map("category_id") @db.Uuid
  category          ForumCategory? @relation(fields: [categoryId], references: [id])
  name              String    @db.VarChar(100)
  fid               Int       @unique
  enableScraping    Boolean   @default(false) @map("enable_scraping")
  enableAutoReply   Boolean   @default(false) @map("enable_auto_reply")
  replyThresholdMin Int       @default(0) @map("reply_threshold_min")
  replyThresholdMax Int       @default(5) @map("reply_threshold_max")
  scanInterval      Int       @default(30) @map("scan_interval")
  defaultToneMode   String    @default("") @map("default_tone_mode") @db.VarChar(50)
  defaultRuleIds    String[]  @default([]) @map("default_rule_ids")
  excludeRuleIds    String[]  @default([]) @map("exclude_rule_ids")
  lastScannedAt     DateTime? @map("last_scanned_at") @db.Timestamptz()
  isActive          Boolean   @default(true) @map("is_active")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  personaBindings BoardPersonaBinding[]

  @@map("forum_boards")
}

model BoardPersonaBinding {
  id        String  @id @default(uuid()) @db.Uuid
  boardId   String  @map("board_id") @db.Uuid
  board     ForumBoard @relation(fields: [boardId], references: [id], onDelete: Cascade)
  personaId String  @map("persona_id") @db.Uuid
  persona   Persona @relation(fields: [personaId], references: [id], onDelete: Cascade)
  priority  Int     @default(0)

  @@unique([boardId, personaId])
  @@map("board_persona_bindings")
}

model GoogleTrend {
  id             String    @id @default(uuid()) @db.Uuid
  query          String    @unique @db.VarChar(500)
  score          Int       @default(0)
  peakVolume     Int       @default(0) @map("peak_volume")
  durationHours  Float     @default(0) @map("duration_hours")
  categories     String[]  @default([])
  trendBreakdown Json      @default("[]") @map("trend_breakdown")
  analysis       Json      @default("{}") @map("analysis")
  pullId         String    @default("") @map("pull_id") @db.VarChar(100)
  pulledAt       DateTime? @map("pulled_at") @db.Timestamptz()
  geo            String    @default("HK") @db.VarChar(10)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  news GoogleTrendNews[]

  @@index([pullId])
  @@index([pulledAt(sort: Desc)])
  @@map("google_trends")
}

model GoogleTrendNews {
  id          String    @id @default(uuid()) @db.Uuid
  trendId     String    @map("trend_id") @db.Uuid
  trend       GoogleTrend @relation(fields: [trendId], references: [id], onDelete: Cascade)
  title       String    @default("") @db.Text
  source      String    @default("") @db.VarChar(200)
  url         String    @default("") @db.Text
  snippet     String    @default("") @db.Text
  publishedAt DateTime? @map("published_at") @db.Timestamptz()

  @@map("google_trend_news")
}

model Feed {
  id               String    @id @default(uuid()) @db.Uuid
  feedId           String    @unique @map("feed_id") @db.VarChar(50)
  type             String    @default("reply") @db.VarChar(20)
  status           String    @default("pending") @db.VarChar(20)
  // source
  sourceType       String    @default("") @map("source_type") @db.VarChar(20)
  sourceTrendId    String?   @map("source_trend_id") @db.Uuid
  sourceTrend      Trend?    @relation(fields: [sourceTrendId], references: [id])
  sourceScanId     String    @default("") @map("source_scan_id") @db.VarChar(100)
  // thread
  threadTid        String    @default("") @map("thread_tid") @db.VarChar(50)
  threadFid        Int       @default(0) @map("thread_fid")
  threadSubject    String    @default("") @map("thread_subject") @db.Text
  threadAuthor     String    @default("") @map("thread_author") @db.VarChar(100)
  threadReplies    Int       @default(0) @map("thread_replies")
  threadContent    String    @default("") @map("thread_content") @db.Text
  // trend
  trendTopic       String    @default("") @map("trend_topic") @db.VarChar(500)
  trendSummary     String    @default("") @map("trend_summary") @db.Text
  // persona
  personaId        String?   @map("persona_id") @db.Uuid
  persona          Persona?  @relation(fields: [personaId], references: [id])
  personaUsername  String    @default("") @map("persona_username") @db.VarChar(100)
  // generated
  generatedTitle   String    @default("") @map("generated_title") @db.Text
  generatedContent String    @default("") @map("generated_content") @db.Text
  toneUsed         String    @default("") @map("tone_used") @db.VarChar(50)
  // evaluation
  evalRelevance    Float     @default(0) @map("eval_relevance")
  evalQuality      Float     @default(0) @map("eval_quality")
  evalSensitivity  Int       @default(1) @map("eval_sensitivity")
  // google trends
  googleTrendsData Json      @default("{}") @map("google_trends_data")
  // post result
  postId           String    @default("") @map("post_id") @db.VarChar(100)
  postedAt         DateTime? @map("posted_at") @db.Timestamptz()
  postError        String    @default("") @map("post_error") @db.Text
  postAttempts     Int       @default(0) @map("post_attempts")
  // review
  claimedBy        String?   @map("claimed_by") @db.Uuid
  claimedByUser    User?     @relation("ClaimedFeeds", fields: [claimedBy], references: [id])
  claimedAt        DateTime? @map("claimed_at") @db.Timestamptz()
  reviewedBy       String?   @map("reviewed_by") @db.Uuid
  reviewedByUser   User?     @relation("ReviewedFeeds", fields: [reviewedBy], references: [id])
  reviewedAt       DateTime? @map("reviewed_at") @db.Timestamptz()
  reviewNote       String    @default("") @map("review_note") @db.Text
  // quality
  qualityWarnings  String[]  @default([]) @map("quality_warnings")
  isDuplicate      Boolean   @default(false) @map("is_duplicate")
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  @@index([status, createdAt(sort: Desc)])
  @@index([personaId, status])
  @@index([threadFid, status])
  @@index([claimedBy, claimedAt])
  @@index([sourceType, createdAt(sort: Desc)])
  @@unique([threadTid, personaId])
  @@map("feeds")
}

model Trend {
  id              String   @id @default(uuid()) @db.Uuid
  pullId          String   @map("pull_id") @db.VarChar(100)
  source          String   @db.VarChar(20)
  rank            Int      @default(0)
  topicLabel      String   @map("topic_label") @db.VarChar(500)
  summary         String   @default("") @db.Text
  engagements     Int      @default(0)
  postCount       Int      @default(0) @map("post_count")
  sensitivityTier Int      @default(1) @map("sensitivity_tier")
  sentimentScore  Float    @default(0) @map("sentiment_score")
  sentimentLabel  String   @default("") @map("sentiment_label") @db.VarChar(20)
  rawData         Json     @default("{}") @map("raw_data")
  feedIds         String[] @default([]) @map("feed_ids") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  feeds Feed[]

  @@unique([source, topicLabel])
  @@index([source, createdAt(sort: Desc)])
  @@map("trends")
}

model QueueJob {
  id              String    @id @default(uuid()) @db.Uuid
  queueName       String    @map("queue_name") @db.VarChar(30)
  jobId           String    @default("") @map("job_id") @db.VarChar(100)
  status          String    @default("waiting") @db.VarChar(20)
  startedAt       DateTime? @map("started_at") @db.Timestamptz()
  completedAt     DateTime? @map("completed_at") @db.Timestamptz()
  durationMs      Int       @default(0) @map("duration_ms")
  result          Json      @default("{}") @map("result")
  error           String    @default("") @db.Text
  triggeredBy     String    @default("cron") @map("triggered_by") @db.VarChar(20)
  triggeredByUser String    @default("") @map("triggered_by_user") @db.VarChar(100)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  @@index([queueName, status, createdAt(sort: Desc)])
  @@map("queue_jobs")
}

model DailyStats {
  id        String   @id @default(uuid()) @db.Uuid
  date      DateTime @unique @db.Date
  scanner   Json     @default("{}")
  feeds     Json     @default("{}")
  trends    Json     @default("{}")
  posts     Json     @default("{}")
  byBoard   Json     @default("[]") @map("by_board")
  byPersona Json     @default("[]") @map("by_persona")
  gemini    Json     @default("{}")
  quality   Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("daily_stats")
}

model AuditLog {
  id           String   @id @default(uuid()) @db.Uuid
  operator     String   @default("") @db.VarChar(100)
  eventType    String   @map("event_type") @db.VarChar(50)
  module       String   @db.VarChar(20)
  feedId       String   @default("") @map("feed_id") @db.VarChar(50)
  targetId     String   @default("") @map("target_id") @db.VarChar(100)
  bkUsername   String   @default("") @map("bk_username") @db.VarChar(100)
  actionDetail String   @default("") @map("action_detail") @db.Text
  beforeData   Json?    @map("before_data")
  afterData    Json?    @map("after_data")
  apiStatus    Int      @default(0) @map("api_status")
  ip           String   @default("") @db.VarChar(50)
  session      String   @default("web") @db.VarChar(20)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@index([module, createdAt(sort: Desc)])
  @@map("audit_logs")
}
```

### 1.3 Service 层改写策略

#### 通用 CRUD 重写 (shared/crud.ts)

```typescript
// shared/crud.ts — Prisma 版本
import { PrismaClient } from '@prisma/client';
import { auditService } from '../modules/audit/audit.service.js';

type ModelName = Uncapitalize<keyof PrismaClient & string>;

interface CrudOptions {
  defaultSort?: Record<string, 'asc' | 'desc'>;
  lookupField?: string;
  maxLimit?: number;
  searchFields?: string[];
}

export function buildCrud(modelName: ModelName, moduleName: string, opts: CrudOptions = {}) {
  const { defaultSort = { createdAt: 'desc' }, maxLimit = 200 } = opts;

  return {
    async list(query: Record<string, any>) {
      const page = Math.max(1, parseInt(query.page) || 1);
      const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || 20));
      const skip = (page - 1) * limit;

      // 构建 where 条件 (从 query params 过滤)
      const where = buildWhere(query, modelName);

      const [data, total] = await Promise.all([
        prisma[modelName].findMany({ where, skip, take: limit, orderBy: defaultSort }),
        prisma[modelName].count({ where }),
      ]);

      return {
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    },

    async getById(id: string) {
      const record = await prisma[modelName].findUnique({ where: { id } });
      if (!record) throw new NotFoundError(`${moduleName} not found`);
      return record;
    },

    async create(body: Record<string, any>, operator?: string) {
      const record = await prisma[modelName].create({ data: body });
      await auditService.log({ operator, eventType: 'create', module: moduleName, after: record });
      return record;
    },

    async update(id: string, body: Record<string, any>, operator?: string) {
      const before = await prisma[modelName].findUnique({ where: { id } });
      if (!before) throw new NotFoundError(`${moduleName} not found`);
      const after = await prisma[modelName].update({ where: { id }, data: body });
      await auditService.log({ operator, eventType: 'update', module: moduleName, before, after });
      return after;
    },

    async remove(id: string, operator?: string) {
      const before = await prisma[modelName].findUnique({ where: { id } });
      if (!before) throw new NotFoundError(`${moduleName} not found`);
      await prisma[modelName].delete({ where: { id } });
      await auditService.log({ operator, eventType: 'delete', module: moduleName, before });
    },
  };
}
```

#### 逐模块改写优先级

| 优先级 | 模块 | 改写量 | 难点 |
|---|---|---|---|
| P0 | config | 小 | 简单 KV，最先改以验证 Prisma 集成 |
| P0 | auth | 中 | JWT 逻辑不变，Redis token blacklist → DB 或内存 |
| P1 | feed | **大** | 最复杂 model，38 字段，6 索引，核心业务 |
| P1 | persona | 中 | 嵌套数组 → PostgreSQL array，加密逻辑不变 |
| P1 | forum (board) | 中 | personaBindings 拆表 |
| P2 | scanner | 大 | 业务逻辑重，但 DB 操作相对规整 |
| P2 | poster | 大 | 同上，发帖逻辑与 Feed 紧耦合 |
| P2 | trends | 中 | 有 unique 约束和 upsert 逻辑 |
| P2 | queue | 中 | recordJob 逻辑简单 |
| P3 | dashboard | 中 | 多表统计查询 → Prisma groupBy 或原生 SQL |
| P3 | google-trends | 中 | news 子文档拆表 |
| P3 | audit | 小 | 纯 insert，TTL → 定期 DELETE |
| P3 | tone, topic-rules | 小 | 用 buildCrud，最简单 |

### 1.4 Auth 模块 Redis 替代

当前 Redis 用途：
1. **Token blacklist** (logout 时存 token → Redis, TTL = token 剩余时间)
2. **Role invalidation** (角色变更时标记旧 token 失效)

替代方案：

```typescript
// 方案: 用 PostgreSQL 表替代 Redis token blacklist
// (对于 1-5 管理员场景，查询量极小)

model TokenBlacklist {
  id        String   @id @default(uuid()) @db.Uuid
  token     String   @unique @db.Text
  expiresAt DateTime @map("expires_at") @db.Timestamptz()
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@index([expiresAt])  // 定期清理过期记录
  @@map("token_blacklist")
}

// auth.service.ts
async logout(token: string, expiresAt: Date) {
  await prisma.tokenBlacklist.create({
    data: { token, expiresAt }
  });
}

async isTokenBlacklisted(token: string): Promise<boolean> {
  const entry = await prisma.tokenBlacklist.findUnique({
    where: { token }
  });
  return !!entry;
}
```

### 1.5 数据迁移脚本

```typescript
// scripts/migrate-mongo-to-pg.ts
// 从 MongoDB 导出 → 转换 → 导入 PostgreSQL
//
// 执行顺序（按外键依赖）:
// 1. users
// 2. configs
// 3. tone_modes
// 4. personas
// 5. topic_rules
// 6. forum_categories → forum_boards → board_persona_bindings
// 7. google_trends → google_trend_news
// 8. trends
// 9. feeds (依赖 personas, trends, users)
// 10. queue_jobs
// 11. daily_stats
// 12. audit_logs
//
// 关键转换:
// - MongoDB ObjectId (_id) → UUID (新生成)
// - 维护 ObjectId → UUID 映射表用于外键关联
// - 嵌套子文档 → 拆为关联表行
// - Date → Timestamptz
// - Mixed → JSONB
```

### 1.6 Phase 1 任务分解

| # | 任务 | 天数 | 依赖 |
|---|---|---|---|
| 1.1 | 初始化 Prisma + PostgreSQL 开发环境 | 0.5 | — |
| 1.2 | 编写完整 Prisma schema (所有 model) | 1.5 | 1.1 |
| 1.3 | 重写 shared/crud.ts (Prisma 版) | 1 | 1.2 |
| 1.4 | 重写 shared/database.ts (Prisma 连接管理) | 0.5 | 1.2 |
| 1.5 | 改写 config + auth service (验证 Prisma 集成) | 1.5 | 1.3 |
| 1.6 | 改写 feed + persona + forum service (核心业务) | 3 | 1.3 |
| 1.7 | 改写 scanner + poster + trends service | 2 | 1.6 |
| 1.8 | 改写 dashboard + queue + google-trends + audit | 1.5 | 1.3 |
| 1.9 | 改写 seed 脚本 (Prisma 版) | 0.5 | 1.2 |
| 1.10 | 编写数据迁移脚本 (MongoDB → PostgreSQL) | 1 | 1.2 |
| 1.11 | 重写全部测试 (213 → Prisma) | 3 | 1.5-1.8 |
| 1.12 | 联调 + 修 bug | 1 | 1.11 |
| | **Phase 1 合计** | **~13 天** | |

---

## Phase 2: 队列/定时迁移 — BullMQ → Cloud Tasks

> 可与 Phase 1 后半段并行

### 2.1 Worker HTTP 化

将 6 个 BullMQ processor 改为 Express HTTP handler：

```typescript
// worker-http.ts (新文件，替代 worker.ts)
import express from 'express';
import { scanBoard } from './modules/scanner/scanner.service.js';
import { pullTrends } from './modules/trends/trends.service.js';
import { postFeed } from './modules/poster/poster.service.js';
import { resetDailyCounters } from './modules/dashboard/dashboard.service.js';
import { aggregateDailyStats } from './modules/dashboard/dashboard.service.js';
import { pullAndStore } from './modules/google-trends/google-trends.service.js';
import { configService } from './modules/config/config.service.js';
import { recordJob } from './modules/queue/queue.service.js';

const app = express();
app.use(express.json());

// Cloud Tasks 认证中间件
function verifyCloudTasksRequest(req, res, next) {
  // 验证来自 Cloud Tasks / Cloud Scheduler 的 OIDC token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // 生产环境: 用 google-auth-library 验证 OIDC token
  next();
}

app.use('/tasks', verifyCloudTasksRequest);

// ─── Scanner ─────────────────────────────────────
app.post('/tasks/scanner', async (req, res) => {
  const paused = await configService.getValue('SCANNER_PAUSED');
  if (paused === 'true') return res.json({ skipped: true, reason: 'paused' });

  const startedAt = new Date();
  try {
    const stats = await scanBoard(req.body.fid);
    await recordJob('scanner', {
      status: 'completed', startedAt, result: stats,
      triggeredBy: req.body.triggeredBy || 'cron',
    });
    res.json({ success: true, stats });
  } catch (err) {
    await recordJob('scanner', {
      status: 'failed', startedAt, error: err.message,
      triggeredBy: req.body.triggeredBy || 'cron',
    });
    res.status(500).json({ error: err.message });
  }
});

// ─── Trends ──────────────────────────────────────
app.post('/tasks/trends', async (req, res) => {
  const paused = await configService.getValue('TRENDS_PAUSED');
  if (paused === 'true') return res.json({ skipped: true, reason: 'paused' });
  // ... 类似 scanner
});

// ─── Poster ──────────────────────────────────────
app.post('/tasks/poster', async (req, res) => {
  const { feedId } = req.body;
  // 幂等检查: 已发帖的不重复发
  const feed = await prisma.feed.findUnique({ where: { feedId } });
  if (feed?.postId) return res.json({ skipped: true, reason: 'already posted' });
  // ... postFeed 逻辑
});

// ─── Daily Reset ─────────────────────────────────
app.post('/tasks/daily-reset', async (req, res) => { /* ... */ });

// ─── Stats ───────────────────────────────────────
app.post('/tasks/stats', async (req, res) => { /* ... */ });

// ─── Google Trends ───────────────────────────────
app.post('/tasks/gtrends', async (req, res) => { /* ... */ });

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.WORKER_PORT || 3001;
app.listen(PORT, () => console.log(`Worker HTTP listening on ${PORT}`));
```

### 2.2 Queue Service 改写

```typescript
// modules/queue/queue.service.ts — Cloud Tasks 版
import { CloudTasksClient } from '@google-cloud/tasks';

const client = new CloudTasksClient();
const PROJECT = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'asia-east1';
const WORKER_URL = process.env.WORKER_SERVICE_URL;

// 队列名映射
const QUEUE_MAP: Record<string, string> = {
  scanner:          'scanner-queue',
  trends:           'trends-queue',
  poster:           'poster-queue',
  'daily-reset':    'daily-reset-queue',
  'stats-aggregator': 'stats-queue',
  'google-trends':  'gtrends-queue',
};

export async function addTask(queueName: string, data: any, delaySeconds?: number) {
  const queue = QUEUE_MAP[queueName];
  const parent = client.queuePath(PROJECT, LOCATION, queue);

  const task: any = {
    httpRequest: {
      httpMethod: 'POST',
      url: `${WORKER_URL}/tasks/${queueName}`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(data)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: process.env.CLOUD_TASKS_SA_EMAIL,
      },
    },
  };

  if (delaySeconds) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    };
  }

  await client.createTask({ parent, task });
}

// 本地开发降级：直接调用 Worker HTTP
export async function addTaskLocal(queueName: string, data: any) {
  const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
  await fetch(`${workerUrl}/tasks/${queueName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
```

### 2.3 移除 Redis + Socket.io + Leader Election

| 文件 | 操作 |
|---|---|
| shared/redis.ts | **删除** |
| shared/socket.ts | **删除** |
| worker.ts | **替换为** worker-http.ts |
| server.ts | 移除 Redis/Socket 初始化 |
| app.ts | 移除 Socket.io middleware |
| auth.service.ts | Redis blacklist → PostgreSQL token_blacklist 表 |
| health-monitor.ts | Redis cache → 内存 cache (Map) |
| health.controller.ts | 移除 Redis status check |
| 前端 socket/index.ts | **删除** |
| 前端 socket/listeners.ts | **删除** |
| 前端 AppLayout.vue | 移除 socket mount/unmount |

### 2.4 Phase 2 任务分解

| # | 任务 | 天数 | 依赖 |
|---|---|---|---|
| 2.1 | 创建 worker-http.ts (6 个 HTTP handler) | 1.5 | Phase 1 |
| 2.2 | 改写 queue.service.ts (Cloud Tasks SDK) | 1 | — |
| 2.3 | 添加 QueueAdapter 接口 (本地 / Cloud Tasks) | 0.5 | 2.2 |
| 2.4 | 移除 Redis (redis.ts, leader election) | 0.5 | 2.1 |
| 2.5 | 移除 Socket.io (前端 + 后端) | 0.5 | — |
| 2.6 | auth.service.ts Redis → PostgreSQL | 0.5 | Phase 1 |
| 2.7 | health-monitor.ts Redis → 内存 cache | 0.5 | 2.4 |
| 2.8 | 测试调整 (队列相关) | 1 | 2.1-2.7 |
| | **Phase 2 合计** | **~6 天** | |

---

## Phase 3: GCP 基础设施 + 部署

### 3.1 GCP 资源创建

```bash
# 0. 项目 + API
gcloud projects create bk-admin-prod
gcloud config set project bk-admin-prod
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com

# 1. Artifact Registry
gcloud artifacts repositories create bk-admin \
  --repository-format=docker --location=asia-east1

# 2. Cloud SQL (PostgreSQL 15)
gcloud sql instances create bk-admin-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-east1 \
  --storage-size=10GB \
  --storage-type=SSD \
  --backup-start-time=04:00 \
  --availability-type=zonal

gcloud sql databases create baby_kingdom --instance=bk-admin-db

gcloud sql users create bkadmin \
  --instance=bk-admin-db \
  --password="<生成随机密码>"

# 3. Secret Manager
echo -n "<jwt-secret>" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "<jwt-refresh-secret>" | gcloud secrets create JWT_REFRESH_SECRET --data-file=-
echo -n "<aes-key>" | gcloud secrets create AES_KEY --data-file=-
echo -n "<gemini-api-key>" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "<db-password>" | gcloud secrets create DB_PASSWORD --data-file=-

# 4. Service Account
gcloud iam service-accounts create bk-backend-sa
gcloud iam service-accounts create bk-worker-sa
gcloud iam service-accounts create bk-scheduler-sa

# Backend SA permissions
gcloud projects add-iam-policy-binding bk-admin-prod \
  --member="serviceAccount:bk-backend-sa@bk-admin-prod.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding bk-admin-prod \
  --member="serviceAccount:bk-backend-sa@bk-admin-prod.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"
gcloud projects add-iam-policy-binding bk-admin-prod \
  --member="serviceAccount:bk-backend-sa@bk-admin-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Worker SA permissions
gcloud projects add-iam-policy-binding bk-admin-prod \
  --member="serviceAccount:bk-worker-sa@bk-admin-prod.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding bk-admin-prod \
  --member="serviceAccount:bk-worker-sa@bk-admin-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Scheduler SA → 可调用 Worker Cloud Run
gcloud run services add-iam-policy-binding bk-worker \
  --member="serviceAccount:bk-scheduler-sa@bk-admin-prod.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=asia-east1

# 5. Cloud Tasks Queues
gcloud tasks queues create poster-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-dispatches-per-second=0.028 \
  --max-attempts=3

gcloud tasks queues create scanner-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

gcloud tasks queues create trends-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

gcloud tasks queues create daily-reset-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

gcloud tasks queues create stats-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

gcloud tasks queues create gtrends-queue \
  --location=asia-east1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=2

# 6. Cloud Scheduler
WORKER_URL="https://bk-worker-xxxxx.a.run.app"
SA="bk-scheduler-sa@bk-admin-prod.iam.gserviceaccount.com"

gcloud scheduler jobs create http scanner-cron \
  --location=asia-east1 --schedule="*/5 * * * *" \
  --uri="${WORKER_URL}/tasks/scanner" --http-method=POST \
  --oidc-service-account-email=${SA} --time-zone="Asia/Hong_Kong"

gcloud scheduler jobs create http trends-cron \
  --location=asia-east1 --schedule="0 * * * *" \
  --uri="${WORKER_URL}/tasks/trends" --http-method=POST \
  --oidc-service-account-email=${SA} --time-zone="Asia/Hong_Kong"

gcloud scheduler jobs create http daily-reset-cron \
  --location=asia-east1 --schedule="0 0 * * *" \
  --uri="${WORKER_URL}/tasks/daily-reset" --http-method=POST \
  --oidc-service-account-email=${SA} --time-zone="Asia/Hong_Kong"

gcloud scheduler jobs create http stats-cron \
  --location=asia-east1 --schedule="5 * * * *" \
  --uri="${WORKER_URL}/tasks/stats" --http-method=POST \
  --oidc-service-account-email=${SA} --time-zone="Asia/Hong_Kong"

gcloud scheduler jobs create http gtrends-cron \
  --location=asia-east1 --schedule="*/30 * * * *" \
  --uri="${WORKER_URL}/tasks/gtrends" --http-method=POST \
  --oidc-service-account-email=${SA} --time-zone="Asia/Hong_Kong"

gcloud scheduler jobs create http health-cron \
  --location=asia-east1 --schedule="*/5 * * * *" \
  --uri="${WORKER_URL}/health" --http-method=GET \
  --oidc-service-account-email=${SA} --time-zone="Asia/Hong_Kong"

# 7. Cloud Storage (前端)
gsutil mb -l asia-east1 gs://bk-admin-frontend
gsutil web set -m index.html -e index.html gs://bk-admin-frontend
```

### 3.2 Cloud Run 部署

```bash
# Backend API
gcloud run deploy bk-backend \
  --image asia-east1-docker.pkg.dev/bk-admin-prod/bk-admin/backend:latest \
  --region asia-east1 \
  --platform managed \
  --allow-unauthenticated \
  --port 3000 \
  --min-instances 0 --max-instances 5 \
  --memory 512Mi --cpu 1 \
  --add-cloudsql-instances bk-admin-prod:asia-east1:bk-admin-db \
  --service-account bk-backend-sa@bk-admin-prod.iam.gserviceaccount.com \
  --set-secrets "JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,AES_KEY=AES_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,DB_PASSWORD=DB_PASSWORD:latest" \
  --set-env-vars "NODE_ENV=production,DB_HOST=/cloudsql/bk-admin-prod:asia-east1:bk-admin-db,DB_NAME=baby_kingdom,DB_USER=bkadmin,GCP_PROJECT_ID=bk-admin-prod,WORKER_SERVICE_URL=https://bk-worker-xxxxx.a.run.app"

# Worker
gcloud run deploy bk-worker \
  --image asia-east1-docker.pkg.dev/bk-admin-prod/bk-admin/worker:latest \
  --region asia-east1 \
  --platform managed \
  --no-allow-unauthenticated \
  --ingress internal \
  --port 3001 \
  --min-instances 0 --max-instances 3 \
  --memory 512Mi --cpu 1 \
  --timeout 600 \
  --add-cloudsql-instances bk-admin-prod:asia-east1:bk-admin-db \
  --service-account bk-worker-sa@bk-admin-prod.iam.gserviceaccount.com \
  --set-secrets "AES_KEY=AES_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,DB_PASSWORD=DB_PASSWORD:latest" \
  --set-env-vars "NODE_ENV=production,DB_HOST=/cloudsql/bk-admin-prod:asia-east1:bk-admin-db,DB_NAME=baby_kingdom,DB_USER=bkadmin"
```

### 3.3 Cloud Build CI/CD

```yaml
# cloudbuild.yaml
steps:
  # Build backend
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}',
           '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:latest',
           './backend']

  # Build worker
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/worker:${SHORT_SHA}',
           '-t', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/worker:latest',
           '-f', './backend/Dockerfile.worker', './backend']

  # Build frontend
  - name: 'node:20-alpine'
    entrypoint: 'sh'
    args: ['-c', 'cd frontend && npm ci && npm run build']

  # Push images
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '--all-tags', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '--all-tags', '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/worker']

  # Run DB migrations
  - name: 'gcr.io/cloud-builders/docker'
    args: ['run', '--rm',
           '${_REGION}-docker.pkg.dev/${PROJECT_ID}/bk-admin/backend:${SHORT_SHA}',
           'npx', 'prisma', 'migrate', 'deploy']

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

trigger:
  branch:
    name: main
```

### 3.4 Phase 3 任务分解

| # | 任务 | 天数 | 依赖 |
|---|---|---|---|
| 3.1 | 创建 GCP 项目 + 开启 API | 0.5 | — |
| 3.2 | 创建 Cloud SQL + 运行 Prisma migrate | 0.5 | Phase 1 |
| 3.3 | 配置 Secret Manager + Service Accounts | 0.5 | 3.1 |
| 3.4 | 创建 Cloud Tasks queues + Cloud Scheduler | 0.5 | 3.1 |
| 3.5 | 编写 cloudbuild.yaml + Dockerfile.worker | 0.5 | — |
| 3.6 | 部署 Cloud Run (backend + worker) | 0.5 | 3.2, 3.3, 3.5 |
| 3.7 | 部署前端到 Cloud Storage + 域名配置 | 0.5 | 3.1 |
| 3.8 | 端到端冒烟测试 | 0.5 | 3.6, 3.7 |
| | **Phase 3 合计** | **~4 天** | |

---

## Phase 4: 前端适配 + 端到端验证

### 4.1 前端改动

| 改动 | 说明 |
|---|---|
| 移除 socket/index.ts + listeners.ts | 删除 WebSocket 相关代码 |
| AppLayout.vue 移除 socket | 删除 onMounted/onUnmounted 的 socket 连接 |
| 实时数据 → 轮询 | queue status、scanner result 等改为定时 API 轮询 (30s) |
| API base URL | 环境变量指向 Cloud Run backend URL |
| 构建配置 | Vite 环境变量适配 |

### 4.2 Phase 4 任务分解

| # | 任务 | 天数 | 依赖 |
|---|---|---|---|
| 4.1 | 移除前端 Socket.io + 改为轮询 | 1 | Phase 2 |
| 4.2 | 前端构建 + 部署到 Cloud Storage | 0.5 | Phase 3 |
| 4.3 | 数据迁移 (MongoDB → Cloud SQL) | 0.5 | Phase 3 |
| 4.4 | 端到端全功能验证 | 1 | 4.1-4.3 |
| | **Phase 4 合计** | **~3 天** | |

---

## 成本估算

### 月费

| 服务 | 规格 | 开发 (USD) | 生产 (USD) |
|---|---|---|---|
| Cloud Run (Backend) | min=0 | ~$0 | ~$3-5 |
| Cloud Run (Worker) | min=0 | ~$0 | ~$1-3 |
| Cloud SQL | db-f1-micro / db-g1-small | **$8** | **$26** |
| Cloud Tasks | <100 万次/月 | $0 | $0 |
| Cloud Scheduler | 6 jobs | $0.60 | $0.60 |
| Cloud Storage | <1GB | $0.03 | $0.03 |
| Cloud Build | 免费额度 | $0 | $0 |
| Secret Manager | 6 secrets | ~$0 | ~$0 |
| Artifact Registry | <500MB | $0.05 | $0.05 |
| **合计** | | **~$9/月** | **~$31-35/月** |

### 与其他方案对比

| 方案 | 生产月费 | 迁移工作量 | 运维负担 |
|---|---|---|---|
| VM + docker-compose + MongoDB | ~$24 | 4 天 | 中-高 |
| Cloud Run + MongoDB Atlas M10 | ~$66 | 8 天 | 低 |
| **Cloud Run + Cloud SQL** | **~$32** | **26 天** | **极低** |

---

## 风险清单

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| Prisma 改写引入 bug | 中 | 业务数据异常 | 213 测试全部迁移 + 端到端验证 |
| MongoDB → PostgreSQL 数据丢失 | 低 | 数据完整性 | 迁移前后 count 校验 + 抽样比对 |
| Cloud Tasks 与 BullMQ 行为差异 | 低 | poster 发帖异常 | 充分测试 rate limit + 幂等性 |
| Cloud SQL db-f1-micro 性能不足 | 低 | 查询慢 | 监控，必要时升 g1-small |
| 冷启动影响体验 | 低 | 首次 2-5s | 可设 min-instances=1 (+$15/月) |
| 开发周期超预期 | 中 | 延期 | 按 Phase 独立交付，随时可停 |

---

## 时间线

```
Week 1-2:  Phase 1 (数据库迁移 — Prisma schema + 核心 service 改写)
Week 3:    Phase 1 续 (剩余 service + 测试) + Phase 2 开始 (队列改造)
Week 4:    Phase 2 完成 + Phase 3 (GCP 基础设施)
Week 5:    Phase 4 (前端适配 + 端到端验证 + 上线)

总计: ~5 周（单人），可压缩到 ~3.5 周（如双人并行 Phase 1 + Phase 2）
```
