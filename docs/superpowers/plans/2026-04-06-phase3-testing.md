# Phase 3: Testing & Security Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 108 个后端测试扩展到全面覆盖（~300 测试），修复安全漏洞，增加前端测试和 E2E 测试。

**Current State:** 108 backend integration tests, 0 frontend tests, 0 E2E tests, 0 security tests

**Target:** ~180 backend + ~30 unit + ~45 frontend + ~12 E2E + ~30 security = ~300 tests

---

## Phase 3A: P0 Critical（2 天）

### Task 1: Poster 模块测试（0→8 tests）

**Files:**
- Create: `backend/tests/modules/poster/poster.test.js`

**测试用例:**

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | `POST /poster/:id/post` mock 模式全流程 | approved → posted, postedAt 设值, postId 含 "mock" |
| 2 | `POST /poster/:id/post` 非 approved 状态拒绝 | status=pending 返回 422 |
| 3 | `POST /poster/:id/post` feed 不存在 | 返回 404 |
| 4 | `POST /poster/:id/post` persona 不存在 | 返回 422 |
| 5 | `POST /poster/:id/post` 更新 persona.postsToday | 发帖后 postsToday +1 |
| 6 | `GET /poster/history` 返回 posted/failed feeds | 分页, status 筛选 |
| 7 | `GET /poster/history` 空数据返回空数组 | pagination.total=0 |
| 8 | `POST /forums/sync` mock 模式 | 返回 success:false (无 BK_BASE_URL) |

- [ ] 创建测试文件，seed admin + persona + approved feed
- [ ] 运行测试验证全部 pass
- [ ] Commit

---

### Task 2: Feed Reject + Batch 测试补充（+6 tests）

**Files:**
- Modify: `backend/tests/modules/feed/feed.test.js`

**新增测试用例:**

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | `POST /feeds/:id/reject` 正常 reject + notes | status=rejected, adminNotes 存储 |
| 2 | `POST /feeds/:id/reject` 非 pending 拒绝 | status=approved 返回 422 |
| 3 | `POST /feeds/batch/reject` 批量 reject | succeeded/failed 数组 |
| 4 | Viewer 无法 approve | GET /feeds 可访问但 POST approve 返回 403 |
| 5 | Viewer 无法 claim | POST claim 返回 403 |
| 6 | Claim 过期后其他用户可 claim | 设 claimedAt 为 11 分钟前，另一用户可 claim |

- [ ] 添加 describe('Reject') 和 describe('Permission') 到 feed.test.js
- [ ] 运行测试
- [ ] Commit

---

### Task 3: 安全修复 — bkPassword 加密

**Files:**
- Modify: `backend/src/modules/persona/persona.model.js` — pre-save hook 加密 bkPassword
- Modify: `backend/src/modules/poster/poster.service.js` — ensureBkLogin 解密 password
- Create: `backend/src/shared/encryption.js` — 提取 AES encrypt/decrypt 为公共模块
- Modify: `backend/src/modules/config/config.service.js` — 引用公共加密模块

**实现:**
- 从 config.service.js 提取 encrypt/decrypt 到 shared/encryption.js
- Persona pre-save: 如果 bkPassword 被修改，AES 加密后存储
- Persona toJSON: bkPassword 显示 "••••••••"
- poster.service ensureBkLogin: 用 decrypt 解密后登录
- 运行 import-data.js 需要重新导入（加密现有密码）

- [ ] 创建 shared/encryption.js
- [ ] 修改 config.service.js 引用公共模块
- [ ] 修改 persona.model.js 添加 pre-save 加密 hook
- [ ] 修改 poster.service.js 解密 bkPassword
- [ ] 写加密/解密测试 (3 tests)
- [ ] 运行全部测试
- [ ] Commit

---

### Task 4: 安全修复 — API 速率限制

**Files:**
- Modify: `backend/package.json` — 添加 express-rate-limit
- Create: `backend/src/shared/middleware/rate-limit.js`
- Modify: `backend/src/app.js` — 应用限制

**限制规则:**

| 端点 | 限制 | 窗口 |
|------|------|------|
| `POST /auth/login` | 5 次 | 1 分钟 |
| `POST /auth/refresh` | 10 次 | 1 分钟 |
| `POST /feeds/custom-generate` | 10 次 | 1 分钟 |
| `POST /feeds/:id/regenerate` | 10 次 | 1 分钟 |
| `POST /scanner/trigger` | 3 次 | 5 分钟 |
| 全局 API | 100 次 | 1 分钟 |

- [ ] 安装 express-rate-limit
- [ ] 创建 rate-limit.js 中间件
- [ ] 在 app.js 和各 routes 文件应用
- [ ] 写速率限制测试 (2 tests: login 超限返回 429)
- [ ] Commit

---

### Task 5: 安全修复 — CRUD 字段白名单 + 批量限制

**Files:**
- Modify: `backend/src/shared/crud.js` — create/update 添加字段白名单
- Modify: `backend/src/modules/feed/feed.service.js` — batch 限制 50 条, list limit 限制 200

**实现:**
- buildCrud 新增 `allowedFields` 选项，create/update 只接受白名单字段
- persona routes: allowedFields 不包含 bkToken, bkTokenExpiry, tokenStatus, postsToday, cooldownUntil, lastPostAt
- batchApprove/batchReject: feedIds.length > 50 返回 422
- feed.service.list: limit = Math.min(limit, 200)

- [ ] 修改 crud.js 添加 allowedFields 过滤
- [ ] 更新 persona/tone/topic-rules routes 传入 allowedFields
- [ ] 修改 feed.service 添加 batch 限制和 list limit
- [ ] 写测试 (2 tests: 超 50 条 batch 拒绝, 内部字段不可通过 API 修改)
- [ ] Commit

---

### Task 6: 安全修复 — NoSQL 注入防护 + XSS 清洗

**Files:**
- Modify: `backend/package.json` — 添加 express-mongo-sanitize, xss
- Modify: `backend/src/app.js` — 添加 mongo-sanitize 中间件
- Modify: `backend/src/modules/feed/feed.service.js` — content 写入前 XSS 清洗

**实现:**
- express-mongo-sanitize 自动过滤 `$` 开头的 key（防止 `{email: {$gt: ""}}` 注入）
- feed updateContent 和 customGenerate: 对 content 做 XSS 清洗（strip HTML tags）
- 写测试: NoSQL 注入登录被拦截, XSS 标签被清洗

- [ ] 安装依赖
- [ ] 添加 mongo-sanitize 中间件到 app.js
- [ ] feed.service 添加 XSS 清洗
- [ ] 写测试 (3 tests)
- [ ] Commit

---

## Phase 3B: P1 Important（3 天）

### Task 7: Worker 缺陷修复

**Files:**
- Modify: `backend/src/worker.js`
- Modify: `docker-compose.yml`

**修复项:**

| # | 问题 | 修复 |
|---|------|------|
| 1 | Worker 健康检查无效 | 改为检查 Redis 连通性: `node -e "import('ioredis').then(m=>{const r=new m.default();r.ping().then(()=>process.exit(0)).catch(()=>process.exit(1))})"` |
| 2 | Cron leader 不会重新选举 | 添加定期（每 60s）重新尝试获取锁，非 leader 在 leader 锁过期后接管 |
| 3 | Poster 幂等性 | postFeed 开始前检查 feed.postId 是否已有值（已发帖则跳过） |
| 4 | auditService.log 未 try/catch | 在 queue.service 的所有 audit 调用外包 try/catch |
| 5 | shutdown 未清理 cron/interval | shutdown 中调用 `cron.getTasks().forEach(t => t.stop())` 和 `clearInterval` |
| 6 | Leader 锁用 PID | 改用 `crypto.randomUUID()` |

- [ ] 修复所有 6 项
- [ ] 运行全部测试
- [ ] Commit

---

### Task 8: Prompt Builder + Quality Guard 单元测试（+24 tests）

**Files:**
- Create: `backend/tests/unit/prompt-builder.test.js`
- Create: `backend/tests/unit/quality-guard.test.js`

**Prompt Builder 测试 (12 tests):**

| # | 用例 |
|---|------|
| 1 | persona=null 不输出角色区块 |
| 2 | persona 无 voiceCues 时跳过 |
| 3 | Tier3 且无 tier3Script 时回退到 toneDoc |
| 4 | topic=null 不输出热话区块 |
| 5 | GEMINI_SYSTEM_PROMPT 自定义值覆盖默认 |
| 6 | MEDIUM_POST_MAX_CHARS 替换 {max_chars} |
| 7 | matchTopicRule 多规则取最高 tier |
| 8 | matchTopicRule 大小写不敏感 |
| 9 | matchTopicRule isActive=false 不匹配 |
| 10 | resolveToneMode sentimentScore=45 边界 |
| 11 | resolveToneMode sentimentScore=46 不触发 |
| 12 | autoAssignTier 混合 Tier2+Tier3 关键词取 Tier3 |

**Quality Guard 测试 (12 tests):**

| # | 用例 |
|---|------|
| 1-8 | 所有 8 个 AI_PATTERNS 逐一验证触发失败 |
| 9 | 全标点内容 passed=false |
| 10 | content=null passed=false |
| 11 | maxChars 超限 warning |
| 12 | checkSimilarity 空数组 isDuplicate=false |

- [ ] 创建测试文件
- [ ] 运行验证
- [ ] Commit

---

### Task 9: Scanner 深度测试（+6 tests）

**Files:**
- Modify: `backend/tests/modules/scanner/scanner.test.js`

**新增用例:**

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | 队列满时 scanner 跳过 | 创建 100 个 pending feed, trigger 返回 skipped.queueFull=1 |
| 2 | 无 active board 返回 0 | 所有 board enableScraping=false |
| 3 | board enableScraping=false 跳过 | 特定 board 关闭后不扫描 |
| 4 | persona 每日上限达到 | postsToday >= maxPostsPerDay, noPersona 计数 |
| 5 | 超时熔断 | 设 SCANNER_TIMEOUT_MINUTES=0, 立即退出 |
| 6 | Config 阈值影响过滤 | SCANNER_RELEVANCE_THRESHOLD=100, 无 feed 生成 |

- [ ] 添加测试
- [ ] Commit

---

### Task 10: Config 加密测试（+4 tests）

**Files:**
- Create: `backend/tests/unit/encryption.test.js`

| # | 用例 |
|---|------|
| 1 | encrypt 后 decrypt 还原原文 |
| 2 | encrypt 输出包含 `:` 分隔的 iv:ciphertext |
| 3 | 不同 key 无法解密 |
| 4 | 空字符串加密/解密 |

- [ ] 创建测试
- [ ] Commit

---

### Task 11: 前端测试环境搭建

**Files:**
- Modify: `frontend/package.json` — 添加 vitest, @vue/test-utils, @pinia/testing, happy-dom
- Create: `frontend/vitest.config.js`
- Create: `frontend/tests/setup.js`

```bash
cd frontend && npm install -D vitest @vue/test-utils @pinia/testing happy-dom
```

vitest.config.js:
```javascript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  test: { environment: 'happy-dom', globals: true, setupFiles: ['./tests/setup.js'] },
});
```

- [ ] 安装依赖
- [ ] 创建 vitest 配置
- [ ] 验证 `npm run test` 可运行
- [ ] Commit

---

### Task 12: Pinia Store 测试（20 tests）

**Files:**
- Create: `frontend/tests/stores/auth.test.js` (6 tests)
- Create: `frontend/tests/stores/feed.test.js` (7 tests)
- Create: `frontend/tests/stores/notification.test.js` (4 tests)
- Create: `frontend/tests/stores/queue.test.js` (3 tests)

**auth.test.js:**
1. isLoggedIn: 有 token → true
2. isAdmin: role=admin → true
3. isEditor: admin 和 editor 都 true
4. login: mock API → 设置 token + user
5. logout: 清空 token 和 user
6. fetchMe 失败自动 logout

**feed.test.js:**
1. fetchFeeds 设置 loading
2. setFilter 重置 page=1
3. incrementNewCount 累加
4. clearNewCount 归零
5. updateFeedStatus 更新指定 feed
6. updateFeedClaim 设置 claimedBy
7. updateFeedClaim(null) 解除

**notification.test.js:**
1. add 新增通知
2. unreadCount 计算未读
3. markAllRead 全部标记已读
4. 超过 50 条自动丢弃最旧

**queue.test.js:**
1. fetchQueues 设置 loading
2. updateQueueStatus 更新指定队列
3. queues 初始为空数组

- [ ] 创建 4 个测试文件
- [ ] 运行 `npm run test`
- [ ] Commit

---

### Task 13: Router Guard 测试（5 tests）

**Files:**
- Create: `frontend/tests/router/router.test.js`

| # | 用例 |
|---|------|
| 1 | 未登录访问 /feeds → 跳转 /login?redirect=/feeds |
| 2 | viewer 访问 /config (admin-only) → 跳转 dashboard |
| 3 | editor 访问 /feeds → 正常通过 |
| 4 | /login (meta.public) → 无需认证 |
| 5 | auth.user=null 时自动调用 fetchMe |

- [ ] 创建测试
- [ ] Commit

---

## Phase 3C: P2 E2E（3 天）

### Task 14: Playwright 环境搭建

**Files:**
- Create: `frontend/playwright.config.js`
- Create: `frontend/e2e/fixtures/`
- Create: `frontend/e2e/pages/` (Page Object Model)

```bash
cd frontend && npm install -D @playwright/test && npx playwright install
```

- [ ] 安装 Playwright
- [ ] 创建配置和目录结构
- [ ] Commit

---

### Task 15: E2E — 核心业务流程（5 tests）

**Files:**
- Create: `frontend/e2e/tests/auth.spec.js`
- Create: `frontend/e2e/tests/feed-workflow.spec.js`
- Create: `frontend/e2e/tests/scanner.spec.js`

| # | 场景 | 步骤 |
|---|------|------|
| 1 | 登录/登出 | 输入 admin 凭据 → 验证 dashboard → 登出 → 验证回到 login |
| 2 | 完整审核流程 | 登录 → Feeds → 筛选 pending → Claim → 编辑内容 → Approve → 验证状态 |
| 3 | Reject 流程 | Feeds → Claim → 填 notes → Reject → 验证状态 |
| 4 | Custom Generate | Feeds → Custom Generate → 填 topic → 提交 → 验证新 feed |
| 5 | Scanner 触发 | Scanner 页 → 触发 → 验证历史列表 |

- [ ] 创建 Page Object: LoginPage, FeedPage, ScannerPage
- [ ] 创建 3 个 spec 文件
- [ ] 运行验证
- [ ] Commit

---

### Task 16: E2E — 权限和 CRUD（5 tests）

**Files:**
- Create: `frontend/e2e/tests/permission.spec.js`
- Create: `frontend/e2e/tests/persona-crud.spec.js`

| # | 场景 | 步骤 |
|---|------|------|
| 6 | 权限控制 | viewer 登录 → Config/Audit/Users 菜单不可见 → URL 直接访问被拦截 |
| 7 | Persona CRUD | 创建 → 列表出现 → 编辑 → 删除 → 列表消失 |
| 8 | Queue 管理 | 查看状态 → 暂停 → 验证 paused → 恢复 |
| 9 | Batch Approve | 勾选多条 → 批量 approve → 验证状态 |
| 10 | Config 编辑 | 进入 Config → 修改值 → 保存 → 刷新验证 |

- [ ] 创建 spec 文件
- [ ] 运行验证
- [ ] Commit

---

### Task 17: E2E — WebSocket 实时推送（2 tests）

**Files:**
- Create: `frontend/e2e/tests/realtime.spec.js`

| # | 场景 | 步骤 |
|---|------|------|
| 11 | Feed claim 实时同步 | 浏览器 A claim → 浏览器 B 看到锁定图标 |
| 12 | Scanner 通知 | 触发扫描 → 验证 toast 弹窗出现 |

- [ ] 创建多浏览器上下文测试
- [ ] Commit

---

## Phase 3D: P3 Performance + Security Tests（2 天）

### Task 18: 性能基线测试

**Files:**
- Create: `backend/tests/performance/feed-query.test.js`
- Create: `backend/tests/performance/batch-ops.test.js`

| # | 测试 | 目标 |
|---|------|------|
| 1 | GET /feeds?status=pending (10 万 feed) | p95 < 200ms |
| 2 | POST /feeds/batch/approve (50 条) | < 5s |
| 3 | POST /scanner/trigger (3 board × mock) | < 10s |
| 4 | checkSimilarity (1000 条历史) | < 100ms |
| 5 | 50 并发 GET /feeds | p99 < 500ms |

- [ ] Seed 大数据量
- [ ] 运行性能测试
- [ ] 记录基线
- [ ] Commit

---

### Task 19: 安全测试用例

**Files:**
- Create: `backend/tests/security/auth-security.test.js`
- Create: `backend/tests/security/injection.test.js`
- Create: `backend/tests/security/authorization.test.js`

**auth-security.test.js (8 tests):**
1. `alg: none` JWT 被拒绝
2. 过期 access token 返回 401
3. refresh token 作为 access token 使用被拒绝
4. 篡改 JWT payload 签名验证失败
5. 已注销 refresh token 无法刷新
6. 角色变更后旧 token 行为验证
7. 登录速率限制触发 429
8. 弱密码注册被拒绝

**injection.test.js (6 tests):**
1. NoSQL 注入登录 `{email: {$gt: ""}}` 被拦截
2. feed 列表 `status[$ne]=null` 查询注入被阻止
3. sort 参数注入无效
4. XSS content `<script>` 被清洗
5. 超 1MB payload 返回 413
6. 超 50 条 batch 返回 422

**authorization.test.js (8 tests):**
1. viewer 无法 approve feed
2. viewer 无法暂停队列
3. editor 无法访问 configs
4. editor 无法注册用户
5. 不能 unclaim 他人 feed
6. editor-A 编辑 editor-B claimed 的 feed（验证是否应拦截）
7. viewer 可读 feeds 列表
8. 管理员不能删除自己

- [ ] 创建 3 个安全测试文件
- [ ] 运行验证
- [ ] Commit

---

## Summary

| Phase | Tasks | New Tests | 预计时间 |
|-------|-------|-----------|---------|
| 3A P0 | 1-6 | ~24 backend + 安全修复 | 2 天 |
| 3B P1 | 7-13 | ~24 unit + ~25 frontend + Worker 修复 | 3 天 |
| 3C P2 | 14-17 | ~12 E2E | 3 天 |
| 3D P3 | 18-19 | ~5 perf + ~22 security | 2 天 |
| **Total** | **19 tasks** | **~112 new tests** | **~10 天** |

最终目标：108 (现有) + 112 (新增) = **~220 tests** 全覆盖。
