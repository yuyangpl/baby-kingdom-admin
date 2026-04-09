# Trends & Feed 优化计划

## 问题总览

| # | 问题 | 当前状态 | 目标 |
|---|------|---------|------|
| 1 | Google Trends 数据堆积 | 每次 pull 按 `(query, pullId)` upsert，不同 pull 创建新记录 | 每次 pull 覆盖旧数据 |
| 2 | Scanner 缺乏热点动态关联 | `matchGoogleTrends()` 已存在但结果未标记到 feed source | 命中热点时 feed source 包含 `trends` |
| 3 | Feed source 互斥 | `source` 是单值 enum `scanner\|trends\|custom` | 改为数组，支持多来源并存 |
| 4 | Trends 生成的 feed 可能是 reply | `resolvePostType()` 40% new-post / 60% reply | Trends 来源强制 `type: thread`，默认 FID:162 |
| 5 | Trend 记录 toneMode/feedIds 未回写 | `generateFromTrend` 不写回，`markUsed` 只 push feedId | 生成后回写 toneMode + feedId |
| 6 | Trends 前端查询过多 | 默认 limit:20，实际每次最多生成 5 条 | 默认 limit:5 匹配 FEEDS_PER_TREND_PULL |

---

## Phase 1: Google Trends 覆盖拉取

**文件:** `backend/src/modules/google-trends/google-trends.service.ts`

**改动:**
- `pullAndStore()` 开头增加 `await GoogleTrend.deleteMany({})` 清空旧数据
- 移除 `pullId` 参与唯一索引的逻辑，改为按 `query` 去重即可
- 保留 `pullId` 字段用于标记本次拉取批次（方便调试）

**影响:** google-trends.model.ts 索引从 `{ query, pullId }` unique 改为 `{ query }` unique

---

## Phase 2: Feed source 改数组

**文件:** `backend/src/modules/feed/feed.model.ts`

**改动:**
- `source` 类型从 `string enum` 改为 `string[]`
  ```typescript
  // Before
  source: 'scanner' | 'trends' | 'custom';
  // After
  source: ('scanner' | 'trends' | 'custom')[];
  ```
- Schema 改为 `{ type: [String], enum: ['scanner', 'trends', 'custom'], required: true }`
- 索引 `{ source: 1, createdAt: -1 }` 对数组字段 MongoDB 自动支持多值匹配

**关联改动:**
- `feed.service.ts` — 所有 `source: 'xxx'` 赋值改为 `source: ['xxx']`
- `scanner.service.ts` — Feed 创建时 `source: ['scanner']`；如果 `matchGoogleTrends()` 命中，改为 `source: ['scanner', 'trends']`
- `feed.service.ts generateFromTrend()` — `source: ['trends']`
- `feed.service.ts customGenerate()` — `source: ['custom']`
- 前端所有 `feed.source === 'xxx'` 判断改为 `feed.source.includes('xxx')`
- 去重检查 `{ threadTid, source: 'scanner' }` 改为 `{ threadTid, source: { $in: ['scanner'] } }` 或用 `$elemMatch`

---

## Phase 3: Trends 强制新帖 + 默认板块

**文件:** `backend/src/modules/feed/feed.service.ts` — `generateFromTrend()`

**改动:**
- 移除 `resolvePostType(rule)` 调用，直接 `type: 'thread'`
- 设置 `threadFid: '162'`（自由講場），从 config `DEFAULT_TREND_FID` 读取，默认 162
- 新帖需要标题：确保 Gemini prompt 要求返回 title + content

**新增 config:**
- `DEFAULT_TREND_FID`: 默认值 `'162'`，category `medialens`

---

## Phase 4: Trend 记录回写 toneMode + feedIds

**文件:** `backend/src/modules/trends/trends.service.ts` — `markUsed()`

**当前:**
```typescript
export async function markUsed(trendId: string, feedId: string): Promise<void> {
  await Trend.findByIdAndUpdate(trendId, {
    isUsed: true,
    usedAt: new Date(),
    $push: { feedIds: feedId },
  });
}
```

**改动:**
- 增加 `toneMode` 参数，一并写入
  ```typescript
  export async function markUsed(trendId: string, feedId: string, toneMode?: string): Promise<void> {
    await Trend.findByIdAndUpdate(trendId, {
      isUsed: true,
      usedAt: new Date(),
      $push: { feedIds: feedId },
      ...(toneMode && { toneMode }),
    });
  }
  ```

**文件:** `backend/src/modules/feed/feed.service.ts` — `generateFromTrend()` 调用处

**当前:** 返回 feedId，由 `trends.service.ts pullTrends()` 调用 `markUsed(trend._id, feedId)`

**改动:** `generateFromTrend()` 返回 `{ feedId, toneMode }` 对象，`pullTrends()` 传递给 `markUsed()`

---

## Phase 5: Scanner 动态关联热点

**文件:** `backend/src/modules/scanner/scanner.service.ts`

**当前:** 第 139 行已调用 `matchGoogleTrends(thread.subject)`，结果传入 prompt，但未影响 feed source

**改动:**
- 如果 `googleTrends` 不为 null（即命中热点），feed 的 source 包含 `'trends'`
  ```typescript
  const feedSource = ['scanner'];
  if (googleTrends) feedSource.push('trends');
  // ...
  source: feedSource,
  ```
- 现有的 `trendTopic` / `trendSummary` 等字段从 googleTrends 结果填充

---

## Phase 6: Trends 前端查询限制

**文件:** `frontend/src/views/trends/TrendsView.vue`

**改动:**
- `pagination.limit` 默认从 20 改为 5
- 或从 config `FEEDS_PER_TREND_PULL` 读取作为默认值

---

## 执行顺序

```
Phase 2 (source 改数组) ← 基础改动，其他 phase 依赖
    ↓
Phase 1 (Google Trends 覆盖) ← 独立，无依赖
Phase 3 (Trends 强制新帖) ← 依赖 Phase 2 的 source 数组
Phase 4 (回写 toneMode/feedIds) ← 独立
Phase 5 (Scanner 关联热点) ← 依赖 Phase 2 的 source 数组
    ↓
Phase 6 (前端查询) ← 最后收尾
```

## 风险点

| 风险 | 应对 |
|------|------|
| source 改数组是 breaking change | 需要迁移脚本将现有数据从 string 转 array |
| 前端多处判断 source | 全局搜索替换，统一改为 includes |
| 测试用例依赖 source 单值 | 同步更新测试 |
