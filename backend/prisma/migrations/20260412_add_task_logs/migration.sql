-- CreateTable
CREATE TABLE "task_logs" (
    "id" UUID NOT NULL,
    "task_name" VARCHAR(30) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'running',
    "duration" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "triggered_by" VARCHAR(10) NOT NULL DEFAULT 'cron',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_logs_task_name_created_at_idx" ON "task_logs"("task_name", "created_at" DESC);
