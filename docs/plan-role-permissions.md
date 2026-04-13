# Plan: Multi-User Role Permissions

## Goal
实现 4 级角色权限体系，控制菜单可见性和操作权限，Feed 指派机制隔离审批。

## Roles

| Role | Level | Description |
|------|-------|-------------|
| admin | 4 | 全部权限，系统管理，採集源，仪表板 |
| editor | 3 | 编辑内容配置（Tones/Rules/Forums），覆盖 approver |
| approver | 2 | 审批 Feed + 管理 Personas |
| viewer | 1 | 只读，仅可查看 Feeds |

## Menu Structure

```
── 總覽 (admin only)
   └── 儀表板
── 內容管理 (all authenticated)
   └── Feed 隊列
── 系統配置 (approver+)
   ├── 人設管理               (approver+)
   ├── 語氣模式               (editor+)
   ├── 話題規則               (editor+)
   └── 版塊管理               (editor+)
── 系統 (admin only)
   ├── 全局配置
   ├── 採集源 (submenu)
   │   ├── 掃描器
   │   ├── 熱門趨勢
   │   └── Google 趨勢數據
   ├── 審計日誌
   └── 用戶管理
```

## Permission Matrix

| Feature | admin | editor | approver | viewer |
|---------|-------|--------|----------|--------|
| Dashboard | Y | N | N | N |
| View Feeds | Y | Y | Y | Y (read-only) |
| Claim/Edit Feed | Y | Y | Y (only assigned) | N |
| Approve/Reject Feed | Y | N | Y (only assigned) | N |
| Personas | Y | Y | Y | N |
| Tones | Y | Y | N | N |
| Topic Rules | Y | Y | N | N |
| Forums | Y | Y | N | N |
| Config | Y | N | N | N |
| Scanner/Trends/Google Trends | Y | N | N | N |
| Users | Y | N | N | N |
| Audit | Y | N | N | N |

## Implementation Steps

### Phase 1: Menu & Frontend Permissions ✅ DONE
- [x] 1.1 AppLayout.vue — 按角色控制菜单可见性
- [x] 1.2 AppLayout.vue — 採集源 submenu（Scanner/Trends/Google Trends）
- [x] 1.3 AppLayout.vue — Dashboard 仅 admin 可见
- [x] 1.4 router/index.ts — 4 级 roleHierarchy，route meta 按角色分配
- [x] 1.5 auth store — 新增 approver 角色类型 + isApprover getter
- [x] 1.6 i18n — 新增 dataSources 翻译 key

### Phase 2: Backend Role Extension
- [ ] 2.1 Prisma schema — User.role 注释更新为 `admin | editor | approver | viewer`
  - VarChar(10) 够用（approver=8 字符）
  - 不需要改字段类型
- [ ] 2.2 Migration — 添加 SQL CHECK 约束 `role IN ('admin','editor','approver','viewer')`
- [ ] 2.3 auth middleware (auth.ts:14) — role 类型扩展加 `'approver'`
  - authorize() 逻辑不变（白名单模式，够灵活）
- [ ] 2.4 Route guards — 各模块路由更新 authorize() 参数：
  - `feeds`: 读取无限制；claim/edit/approve → `authorize('admin','approver')`；edit content → `authorize('admin','editor','approver')`
  - `personas`: `authorize('admin','editor','approver')`
  - `tones/topic-rules/forums`: `authorize('admin','editor')`
  - `config/scanner/trends/google-trends/audit/users`: `authorize('admin')`
- [ ] 2.5 dashboard 路由加 `meta: { role: 'admin' }` 防止 URL 直接访问
- [ ] 2.6 auth.service — register/changeRole 接口校验 approver 为有效角色

### Phase 3: Feed Assignment
- [ ] 3.1 Feed model — 新增 assignedTo/assignedAt 字段 + User relation
  ```prisma
  assignedTo     String?   @map("assigned_to") @db.Uuid
  assignedToUser User?     @relation("AssignedFeeds", fields: [assignedTo], references: [id])
  assignedAt     DateTime? @map("assigned_at") @db.Timestamptz()
  ```
- [ ] 3.2 Feed service — 生成时自动分配逻辑：
  - 从 role='approver' 的活跃用户中选择
  - 负载均衡：选当前 assignedTo 且 status='pending' 最少的 approver
  - 无 approver 时 fallback 到 admin
- [ ] 3.3 Feed service — approve/reject 加校验：
  - `if (user.role !== 'admin' && feed.assignedTo !== userId) throw ForbiddenError`
- [ ] 3.4 Feed service — admin 手动重新指派接口 `PUT /feeds/:id/assign`
- [ ] 3.5 Feed 列表接口 — 按角色自动过滤：
  - approver/editor: 后端自动过滤 `assignedTo = userId`，只返回指派给自己的
  - admin: 返回全部
- [ ] 3.6 FeedView.vue — 按角色控制操作按钮：
  - viewer: 无操作按钮
  - editor: 可编辑内容，不可审批
  - approver: 可审批/拒绝（后端已保证只能看到自己的）
  - admin: 全部操作 + 重新指派

### Phase 4: Cleanup
- [ ] 4.1 Seed data — admin 默认角色不变
- [ ] 4.2 User management page (UserView/UserForm) — 角色下拉支持 4 个选项
- [ ] 4.3 Testing & merge to dev

## Technical Notes

- **authorize() 是白名单模式**，不是层级继承。每个路由需显式列出允许的角色。
- **JWT token 中已包含 role**，前端 auth store 从 token/user 读取角色。
- **现有 claim 机制保留**：assignedTo 是"谁负责审批"，claimedBy 是"谁正在查看/编辑"。
- **Feed.assignedTo 与 Feed.claimedBy 共存**：assignedTo 决定谁能审批，claimedBy 是临时锁（10 分钟过期）。

## Branch
`feature/role-permissions` → merge to `dev`
