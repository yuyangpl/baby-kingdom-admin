# Worker 与 BullMQ 队列机制

## 架构概览

系统采用 **生产者-消费者** 模式，通过 Redis 解耦：

```
API 服务器 (npm run dev)          Worker 进程 (npm run worker)
┌─────────────────────┐          ┌─────────────────────────┐
│  queue.add() 插入任务 │ ──Redis── │  new Worker() 消费任务    │
│  (生产者)            │          │  (消费者 + cron 调度)      │
└─────────────────────┘          └─────────────────────────┘
```

- **API 服务器** — 提供 HTTP 接口，调用 `queue.add()` 往 Redis 写入任务
- **Worker 进程** — 从 Redis 取任务执行，同时运行 cron 定时调度

两者通过 Redis 解耦，互不依赖启动顺序。

## Worker 管理的队列

| 队列 | 作用 | 触发方式 |
|------|------|---------|
| scanner | 扫描 BK 论坛低回复帖，Gemini 评估相关性，生成 Feed 草稿 | cron + 手动触发 |
| trends | 拉取 MediaLens 热门趋势，自动生成 Feed | cron + 手动触发 |
| poster | 将 approved Feed 发布到 BK 论坛 (concurrency:1, 35s 限频) | 审批后自动入队 |
| daily-reset | 每日清零 persona.postsToday | cron (每天 00:00) |
| stats-aggregator | 聚合每日统计数据到 DailyStats | cron |
| 健康检查 | 检测 4 个外部服务 + 邮件告警 | 定时 interval |

## 不启动 Worker 的影响

**所有队列任务不会被执行。** 具体影响：

| 功能 | 影响 |
|------|------|
| Scanner 扫描 | 触发按钮会把 job 加入 Redis 队列，但无人消费，任务积压在 waiting 状态 |
| Trends 拉取 | cron 不运行，不会自动拉取趋势数据 |
| Poster 发帖 | approved 的 Feed 不会发布到论坛 |
| Daily Reset | persona.postsToday 不会每日清零，可能导致发帖数限制不准确 |
| Stats 聚合 | Dashboard 的每日统计不会更新 |
| 健康检查告警 | 不运行，服务异常不会发邮件告警 |

> **注意：** API 服务器仍然可以正常插入任务到 Redis 队列。启动 Worker 后，积压的 waiting 任务会立即被消费执行。

## 启动命令

```bash
# 终端 1: API 服务器
cd backend && npm run dev

# 终端 2: Worker 进程 (必须同时运行)
cd backend && npm run worker
```

## Scanner 页面说明

Scanner（论坛扫描器）是系统的"内容发现"入口：

1. 遍历已配置的 BK 论坛版块
2. 抓取低回复帖子列表
3. 用 Gemini AI 评估每个帖子的相关性（7 层过滤 + 2 熔断）
4. 命中的帖子自动生成 Feed 草稿进入审核队列

扫描结果在历史表格中展示：扫描版块数、帖子数、命中数、生成 Feed 数。
