# 移除 Approved 状态 — 通过即发布

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除 Feed 的 `approved` 中间状态，原来的"通过"操作直接变为"发布"（调用 BK Forum API），简化审核流程为 `pending → posted/failed`

**Architecture:** 所有 approve 函数改为内部调用 poster.postFeed()，成功 → posted，失败 → failed。前端移除 approved tab、通过按钮改为发布按钮。已有 approved 数据批量改回 pending。

**Tech Stack:** TypeScript + Express + Prisma (backend), Vue 3 + Element Plus (frontend)

---

## 状态流变更

```
现在：pending → approved → posted / failed
改后：pending → posted / failed

完整流：
  pending → [发布/J] → posted（成功）/ failed（失败）
  pending → [拒绝/K] → rejected
  pending → [跳过/S] → 回池（pending）
  failed  → [重新待审] → pending
  rejected → [撤回待审] → pending
```

## 涉及文件清单（100+ 处引用）

### 后端（9 文件）
| 文件 | 当前逻辑 | 改动 |
|------|---------|------|
| `feed.service.ts` | approve() 设 status=approved | 改为调 postFeed，成功 posted/失败 failed |
| `feed.service.ts` | batchApprove() | 改为 batchPublish，串行调 postFeed |
| `feed.service.ts` | reject() 允许 approved 状态 | 移除 approved，只允许 pending |
| `feed.controller.ts` | approve/batchApprove controller | 对应改名 |
| `feed.routes.ts` | /approve, /batch/approve 路由 | 改为 /publish, /batch/publish |
| `review-queue.service.ts` | approve() 设 status=approved | 改为调 postFeed，成功 posted/失败 failed |
| `review-queue.service.ts` | myStats() 统计 approved | 移除 approved 统计 |
| `poster.service.ts` | postFeed() 要求 status=approved | 改为允许 pending 状态 |
| `poster.controller.ts` | postFeed() 检查 approved | 同上 |
| `dashboard.service.ts` | 统计 approved 数量 | 移除 approved 相关统计 |
| `tasks.controller.ts` | posterTask 查 approved feeds | 移除（不再有 approved 状态） |
| `schema.prisma` | 注释 `pending|approved|rejected|posted|failed` | 移除 approved |

### 前端（8 文件）
| 文件 | 当前逻辑 | 改动 |
|------|---------|------|
| `FeedView.vue` | tab 包含 approved；通过/批量通过/立即发布按钮 | 移除 approved tab；通过→发布；移除立即发布（合并） |
| `MyDashboardView.vue` | 通过后保留工作台 status=approved；通过/通过并发布按钮 | 发布后直接移除；只保留发布按钮 |
| `FeedEditModal.vue` | isApproved 判断；保存&通过/保存&发布分支 | 统一为保存&发布 |
| `AppLayout.vue` | 侧边栏统计 approved chip | 移除 approved chip |
| `DashboardView.vue` | 已发布显示 posted/approved | 只显示 posted |
| `ScannerView.vue` | 状态颜色 approved: success | 移除 |
| `zh-HK/index.ts` | approved/batchApprove 翻译 | 移除或改为发布 |
| `en/index.ts` | 同上 | 同上 |

### 测试（5 文件）
| 文件 | 改动 |
|------|------|
| `feed.test.ts` | approved 断言改为 posted/failed |
| `poster.test.ts` | approved fixture 改为 pending |
| `dashboard.test.ts` | 移除 approved 统计 |
| `stores/feed.test.ts` | 移除 approved filter/status 测试 |
| `e2e/*.spec.js` | 审批流程测试改为发布流程 |

---

## Task 1: 后端 — poster.postFeed 允许 pending 状态

**Files:**
- Modify: `backend/src/modules/poster/poster.service.ts:56`
- Modify: `backend/src/modules/poster/poster.controller.ts:12`

- [ ] **Step 1:** `poster.service.ts` 第 56 行，`status !== 'approved'` 改为 `!['pending', 'approved'].includes(feed.status)`（兼容过渡期）
- [ ] **Step 2:** `poster.controller.ts` 第 12 行，同样修改
- [ ] **Step 3:** 验证编译通过

---

## Task 2: 后端 — review-queue.approve() 改为直接发布

**Files:**
- Modify: `backend/src/modules/review-queue/review-queue.service.ts`

- [ ] **Step 1:** `approve()` 函数改名为 `publish()`
- [ ] **Step 2:** 内部逻辑改为：
  ```typescript
  // 1. 验证 status = pending 或 failed
  // 2. 验证 claimedBy = userId（pending 时）
  // 3. 设 reviewedBy/reviewedAt
  // 4. 调用 posterService.postFeed(feedId, userId, ip)
  //    成功 → status 自动变 posted（postFeed 内部处理）
  //    失败 → status 自动变 failed（postFeed 内部处理）
  // 5. 清除 claim 信息
  ```
- [ ] **Step 3:** `myStats()` 移除 approved 统计，保留 posted
- [ ] **Step 4:** Controller 和 Routes 对应改名（approve → publish）

---

## Task 3: 后端 — feed.approve() 改为直接发布

**Files:**
- Modify: `backend/src/modules/feed/feed.service.ts`
- Modify: `backend/src/modules/feed/feed.controller.ts`
- Modify: `backend/src/modules/feed/feed.routes.ts`

- [ ] **Step 1:** `approve()` 改为 `publish()`，内部调用 `posterService.postFeed()`
- [ ] **Step 2:** 移除自动 dispatch poster task（第 100-106 行）
- [ ] **Step 3:** `batchApprove()` 改为 `batchPublish()`，串行调 publish
- [ ] **Step 4:** `reject()` 第 139 行，移除 approved 状态支持，只允许 pending
- [ ] **Step 5:** Routes: `/approve` → `/publish`, `/batch/approve` → `/batch/publish`
- [ ] **Step 6:** Controller 对应改名

---

## Task 4: 后端 — dashboard/tasks 移除 approved 统计

**Files:**
- Modify: `backend/src/modules/dashboard/dashboard.service.ts`
- Modify: `backend/src/modules/tasks/tasks.controller.ts`

- [ ] **Step 1:** `dashboard.service.ts` — getRealtime() 移除 approved 计数
- [ ] **Step 2:** `dashboard.service.ts` — getToday() 移除 approved 统计，adjustapprovalRate 计算
- [ ] **Step 3:** `dashboard.service.ts` — aggregateDailyStats() 同上
- [ ] **Step 4:** `tasks.controller.ts` — posterTask 批量模式移除查询 approved feeds（不再有 approved 状态）
- [ ] **Step 5:** `schema.prisma` 注释更新：`pending | rejected | posted | failed`

---

## Task 5: 前端 — FeedView 移除 approved tab，通过改发布

**Files:**
- Modify: `frontend/src/views/feed/FeedView.vue`

- [ ] **Step 1:** Tab 列表从 `['pending', 'approved', 'posted', 'rejected', 'failed']` 改为 `['pending', 'posted', 'rejected', 'failed']`
- [ ] **Step 2:** tabCounts 初始值移除 approved
- [ ] **Step 3:** "通过"按钮改为"发布"，调用 `/v1/feeds/:feedId/publish`
- [ ] **Step 4:** 移除"立即发布"按钮（已合并到发布）
- [ ] **Step 5:** "批量通过"改为"批量发布"，调用 `/v1/feeds/batch/publish`
- [ ] **Step 6:** statusType 映射移除 approved
- [ ] **Step 7:** "重新通过"（failed 状态）改为"重新待审"，调用 revertToPending

---

## Task 6: 前端 — MyDashboardView 简化工作台

**Files:**
- Modify: `frontend/src/views/my-dashboard/MyDashboardView.vue`

- [ ] **Step 1:** 移除 `currentFeed.status === 'approved'` 分支（发布/下一条按钮）
- [ ] **Step 2:** pending 状态按钮改为：跳过(S) / 拒绝(K) / 发布(J)
- [ ] **Step 3:** 移除"通过并发布"按钮（发布已包含）
- [ ] **Step 4:** `doApprove` 改为 `doPublish`，调用 review-queue publish API
- [ ] **Step 5:** 发布成功 → advance()（移除）；发布失败 → 更新本地 status=failed
- [ ] **Step 6:** 移除 `doApproveAndPost`（合并到 doPublish）
- [ ] **Step 7:** 键盘 J 改为调 doPublish
- [ ] **Step 8:** status tag 只显示 pending/failed

---

## Task 7: 前端 — FeedEditModal 统一为保存&发布

**Files:**
- Modify: `frontend/src/views/feed/FeedEditModal.vue`

- [ ] **Step 1:** 移除 `isApproved` computed
- [ ] **Step 2:** footer 按钮统一为：取消 / 重新生成 / 保存 / 保存&发布
- [ ] **Step 3:** `handleSaveAndApprove` 改为 `handleSaveAndPublish`，保存后调 publish API
- [ ] **Step 4:** 移除 `handleSaveAndPost`（合并）

---

## Task 8: 前端 — AppLayout/Dashboard/Scanner 清理

**Files:**
- Modify: `frontend/src/components/AppLayout.vue`
- Modify: `frontend/src/views/dashboard/DashboardView.vue`
- Modify: `frontend/src/views/scanner/ScannerView.vue`

- [ ] **Step 1:** AppLayout 侧边栏移除 approved chip，保留 posted
- [ ] **Step 2:** approverStats 移除 approved 字段
- [ ] **Step 3:** DashboardView 已发布显示只用 posted（不再有 approved）
- [ ] **Step 4:** ScannerView 状态颜色映射移除 approved

---

## Task 9: i18n 清理

**Files:**
- Modify: `frontend/src/locales/zh-HK/index.ts`
- Modify: `frontend/src/locales/en/index.ts`

- [ ] **Step 1:** 移除 `batchApprove` 翻译，改为 `batchPublish`（批量发布）
- [ ] **Step 2:** feed tabs 中 `approved: '已通過'` 移除
- [ ] **Step 3:** myDashboard 中 `approved/approve/approveAndPublish/reApprove` 改为 `publish/published`
- [ ] **Step 4:** 保留 `revertToPending`（撤回待审）

---

## Task 10: 数据迁移 — 已有 approved 数据改回 pending

- [ ] **Step 1:** 执行 SQL：
  ```sql
  UPDATE feeds SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
  WHERE status = 'approved';
  ```
- [ ] **Step 2:** 验证无 approved 状态数据残留

---

## Task 11: 测试更新

**Files:**
- Modify: `backend/tests/modules/feed/feed.test.ts`
- Modify: `backend/tests/modules/poster/poster.test.ts`
- Modify: `backend/tests/modules/dashboard/dashboard.test.ts`

- [ ] **Step 1:** feed.test.ts — approved 断言改为 posted
- [ ] **Step 2:** poster.test.ts — fixture status 从 approved 改为 pending
- [ ] **Step 3:** dashboard.test.ts — 移除 approved 统计

---

## 风险与注意事项

1. **发布耗时**：BK API 发帖约 3-5 秒，用户点发布需等待。需要 loading 状态。
2. **批量发布**：串行调用 BK API，N 条约 N*5 秒。考虑是否保留批量功能或限制数量。
3. **发布限频**：BK 论坛 35 秒间隔，批量发布需排队。
4. **回滚方案**：如果发现问题，将 publish 函数内部改回只设 status=approved 即可快速回滚。
