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
- [ ] 2.1 Prisma schema — User.role 扩展为 admin|editor|approver|viewer
- [ ] 2.2 Migration — 更新 role check 约束
- [ ] 2.3 auth middleware — authorize() 适配 4 级角色
- [ ] 2.4 Route guards — 各模块路由按新角色分配
  - feeds: 所有认证用户可读，approver+ 可操作
  - personas: approver+
  - tones/topic-rules/forums: editor+
  - config/scanner/trends/google-trends/audit/users: admin only

### Phase 3: Feed Assignment
- [ ] 3.1 Feed model — 新增 assignedTo/assignedAt 字段
- [ ] 3.2 Feed service — 生成时从 approver 用户中随机指派（负载均衡：选待审最少的）
- [ ] 3.3 Feed service — approve/reject 校验 assignedTo（admin 豁免）
- [ ] 3.4 Feed service — admin 可手动重新指派
- [ ] 3.5 FeedView.vue — "我的/全部" Tab 筛选
- [ ] 3.6 FeedView.vue — 按角色控制操作按钮（viewer 无操作，editor 可编辑不可审批，approver 可审批指派给自己的）

### Phase 4: Cleanup
- [ ] 4.1 Seed data — 更新默认角色
- [ ] 4.2 User management page — 支持 4 个角色选项
- [ ] 4.3 Testing & merge to dev

## Branch
`feature/role-permissions` → merge to `dev`
