-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'viewer',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configs" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "category" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tone_modes" (
    "id" UUID NOT NULL,
    "tone_id" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "when_to_use" TEXT,
    "emotional_register" TEXT,
    "opening_style" TEXT,
    "sentence_structure" TEXT,
    "what_to_avoid" TEXT,
    "example_opening" TEXT,
    "suitable_for_tier3" BOOLEAN NOT NULL DEFAULT false,
    "override_priority" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tone_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL,
    "account_id" VARCHAR(50) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "archetype" VARCHAR(20) NOT NULL,
    "primary_tone_mode" VARCHAR(50),
    "secondary_tone_mode" VARCHAR(50),
    "avoided_tone_mode" VARCHAR(50),
    "voice_cues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "catchphrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topic_blacklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier3_script" TEXT,
    "max_posts_per_day" INTEGER NOT NULL DEFAULT 3,
    "bk_password" TEXT,
    "bk_uid" INTEGER,
    "bk_token" TEXT,
    "bk_token_expiry" TIMESTAMPTZ,
    "token_status" VARCHAR(10) NOT NULL DEFAULT 'none',
    "last_post_at" TIMESTAMPTZ,
    "posts_today" INTEGER NOT NULL DEFAULT 0,
    "cooldown_until" TIMESTAMPTZ,
    "override_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_rules" (
    "id" UUID NOT NULL,
    "rule_id" VARCHAR(50) NOT NULL,
    "topic_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sensitivity_tier" INTEGER NOT NULL DEFAULT 1,
    "sentiment_trigger" VARCHAR(20) NOT NULL DEFAULT 'any',
    "priority_account_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assign_tone_mode" VARCHAR(50) NOT NULL DEFAULT 'auto',
    "post_type_preference" VARCHAR(20) NOT NULL DEFAULT 'any',
    "gemini_prompt_hint" TEXT,
    "avoid_if" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "topic_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "forum_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_boards" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "fid" INTEGER NOT NULL,
    "enable_scraping" BOOLEAN NOT NULL DEFAULT false,
    "enable_auto_reply" BOOLEAN NOT NULL DEFAULT false,
    "reply_threshold_min" INTEGER NOT NULL DEFAULT 0,
    "reply_threshold_max" INTEGER NOT NULL DEFAULT 40,
    "scan_interval" INTEGER NOT NULL DEFAULT 30,
    "default_tone_mode" VARCHAR(50),
    "default_rule_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclude_rule_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "last_scanned_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "forum_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_persona_bindings" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "tone_mode" VARCHAR(50),
    "weight" VARCHAR(10) NOT NULL DEFAULT 'medium',
    "daily_limit" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "board_persona_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_trends" (
    "id" UUID NOT NULL,
    "query" VARCHAR(500) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "peak_volume" INTEGER NOT NULL DEFAULT 0,
    "duration_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trend_breakdown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "analysis" JSONB,
    "pull_id" VARCHAR(100) NOT NULL,
    "pulled_at" TIMESTAMPTZ NOT NULL,
    "geo" VARCHAR(10) NOT NULL DEFAULT 'HK',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "google_trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_trend_news" (
    "id" UUID NOT NULL,
    "trend_id" UUID NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "google_trend_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeds" (
    "id" UUID NOT NULL,
    "feed_id" VARCHAR(50) NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'reply',
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "source" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thread_tid" INTEGER,
    "thread_fid" INTEGER,
    "thread_subject" TEXT,
    "thread_content" TEXT,
    "subject" TEXT,
    "trend_source" VARCHAR(50),
    "trend_topic" TEXT,
    "trend_summary" TEXT,
    "trend_sentiment" DOUBLE PRECISION,
    "trend_engagement" INTEGER,
    "pull_time" TIMESTAMPTZ,
    "persona_id" VARCHAR(50),
    "bk_username" VARCHAR(100),
    "display_name" VARCHAR(100),
    "archetype" VARCHAR(20),
    "tone_mode" VARCHAR(50),
    "sensitivity_tier" VARCHAR(10),
    "post_type" VARCHAR(10) NOT NULL DEFAULT 'reply',
    "draft_content" TEXT,
    "final_content" TEXT,
    "char_count" INTEGER,
    "admin_edit" BOOLEAN NOT NULL DEFAULT false,
    "relevance_score" DOUBLE PRECISION,
    "worth_replying" BOOLEAN,
    "google_trends" JSONB,
    "posted_at" TIMESTAMPTZ,
    "post_id" VARCHAR(100),
    "post_url" TEXT,
    "fail_reason" TEXT,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMPTZ,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "admin_notes" TEXT,
    "quality_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trends" (
    "id" UUID NOT NULL,
    "pull_id" VARCHAR(100) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "rank" INTEGER,
    "topic_label" VARCHAR(500) NOT NULL,
    "summary" TEXT,
    "engagements" INTEGER,
    "post_count" INTEGER,
    "sensitivity_tier" INTEGER NOT NULL DEFAULT 1,
    "sentiment_score" DOUBLE PRECISION,
    "sentiment_label" VARCHAR(20),
    "raw_data" JSONB,
    "feed_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_jobs" (
    "id" UUID NOT NULL,
    "queue_name" VARCHAR(30) NOT NULL,
    "job_id" VARCHAR(100),
    "status" VARCHAR(10) NOT NULL DEFAULT 'waiting',
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "duration" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "triggered_by" VARCHAR(10) NOT NULL DEFAULT 'cron',
    "triggered_by_user" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" UUID NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "scanner" JSONB NOT NULL DEFAULT '{}',
    "feeds" JSONB NOT NULL DEFAULT '{}',
    "trends" JSONB NOT NULL DEFAULT '{}',
    "posts" JSONB NOT NULL DEFAULT '{}',
    "by_board" JSONB NOT NULL DEFAULT '[]',
    "by_persona" JSONB NOT NULL DEFAULT '[]',
    "gemini" JSONB NOT NULL DEFAULT '{}',
    "quality" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "operator" VARCHAR(100) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "module" VARCHAR(20) NOT NULL,
    "feed_id" VARCHAR(50),
    "target_id" VARCHAR(100),
    "bk_username" VARCHAR(100),
    "action_detail" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    "api_status" INTEGER,
    "ip" VARCHAR(50),
    "session" VARCHAR(10) NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_blacklist" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "configs_key_key" ON "configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tone_modes_tone_id_key" ON "tone_modes"("tone_id");

-- CreateIndex
CREATE UNIQUE INDEX "personas_account_id_key" ON "personas"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_rules_rule_id_key" ON "topic_rules"("rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "forum_boards_fid_key" ON "forum_boards"("fid");

-- CreateIndex
CREATE UNIQUE INDEX "board_persona_bindings_board_id_persona_id_key" ON "board_persona_bindings"("board_id", "persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_trends_query_key" ON "google_trends"("query");

-- CreateIndex
CREATE INDEX "google_trends_pull_id_idx" ON "google_trends"("pull_id");

-- CreateIndex
CREATE INDEX "google_trends_pulled_at_idx" ON "google_trends"("pulled_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "feeds_feed_id_key" ON "feeds"("feed_id");

-- CreateIndex
CREATE INDEX "feeds_status_created_at_idx" ON "feeds"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "feeds_persona_id_status_idx" ON "feeds"("persona_id", "status");

-- CreateIndex
CREATE INDEX "feeds_thread_fid_status_idx" ON "feeds"("thread_fid", "status");

-- CreateIndex
CREATE INDEX "feeds_claimed_by_claimed_at_idx" ON "feeds"("claimed_by", "claimed_at");

-- CreateIndex
CREATE INDEX "feeds_source_idx" ON "feeds" USING GIN ("source");

-- CreateIndex
CREATE UNIQUE INDEX "feeds_thread_tid_persona_id_key" ON "feeds"("thread_tid", "persona_id");

-- CreateIndex
CREATE INDEX "trends_source_created_at_idx" ON "trends"("source", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "trends_source_topic_label_key" ON "trends"("source", "topic_label");

-- CreateIndex
CREATE INDEX "queue_jobs_queue_name_status_created_at_idx" ON "queue_jobs"("queue_name", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_date_key" ON "daily_stats"("date");

-- CreateIndex
CREATE INDEX "audit_logs_module_created_at_idx" ON "audit_logs"("module", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "token_blacklist_token_key" ON "token_blacklist"("token");

-- CreateIndex
CREATE INDEX "token_blacklist_expires_at_idx" ON "token_blacklist"("expires_at");

-- AddForeignKey
ALTER TABLE "forum_boards" ADD CONSTRAINT "forum_boards_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "forum_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_persona_bindings" ADD CONSTRAINT "board_persona_bindings_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "forum_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_persona_bindings" ADD CONSTRAINT "board_persona_bindings_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_trend_news" ADD CONSTRAINT "google_trend_news_trend_id_fkey" FOREIGN KEY ("trend_id") REFERENCES "google_trends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

