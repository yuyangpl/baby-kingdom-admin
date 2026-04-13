# Plan: Multi-User Role Permissions

## Goal
实现 4 级角色权限体系，控制菜单可见性和操作权限，Feed 指派机制隔离审批。

## Roles

| Role | Level | Description |
|------|-------|-------------|
| admin | 4 | 全部权限，系统管理 |
| editor | 3 | 编辑内容配置（Tones/Rules/Forums），覆盖 approver |
| approver | 2 | 审批 Feed + 管理 Personas |
| viewer | 1 | 只读 |

## Menu Structure

```
── Feeds                    (approver+)
── Personas                 (approver+)
── Tones                    (editor+)
── Topic Rules              (editor+)
── Forums                   (editor+)
── Config                   (admin)
── 採集源 (submenu)          (admin)
   ├── Scanner
   ├── Trends
   └── Google Trends
── Users                    (admin)
── Audit                    (admin)
```

## Permission Matrix

| Feature | admin | editor | approver | viewer |
|---------|-------|--------|----------|--------|
| View Feeds | Y | Y | Y | Y (read-only) |
| Claim/Edit/Approve Feed | Y | Y | Y (only assigned) | N |
| Personas | Y | Y | Y | N |
| Tones | Y | Y | N | N |
| Topic Rules | Y | Y | N | N |
| Forums | Y | Y | N | N |
| Config | Y | N | N | N |
| Scanner/Trends/Google Trends | Y | N | N | N |
| Users | Y | N | N | N |
| Audit | Y | N | N | N |

## Implementation Steps

### Phase 1: Menu & Frontend Permissions (priority)
- [ ] 1.1 AppLayout.vue — 角色-菜单映射表，替代散落的 v-if
- [ ] 1.2 AppLayout.vue — 採集源 submenu（Scanner/Trends/Google Trends）
- [ ] 1.3 router/index.ts — route meta 改为 roles 数组
- [ ] 1.4 auth store — 新增 isApprover/isEditorOnly getter

### Phase 2: Backend Role Extension
- [ ] 2.1 Prisma schema — User.role 扩展为 admin|editor|approver|viewer
- [ ] 2.2 Migration — 更新 role check 约束
- [ ] 2.3 auth middleware — authorize() 适配 4 级角色
- [ ] 2.4 Route guards — 各模块路由按新角色分配

### Phase 3: Feed Assignment
- [ ] 3.1 Feed model — 新增 assignedTo/assignedAt 字段
- [ ] 3.2 Feed service — 生成时从 approver 用户中随机指派
- [ ] 3.3 Feed service — approve/reject 校验 assignedTo（admin 豁免）
- [ ] 3.4 FeedView.vue — "我的/全部" Tab 筛选 + 按角色控制操作按钮

### Phase 4: Cleanup
- [ ] 4.1 Seed data — 更新默认角色
- [ ] 4.2 User management page — 支持新角色选项
- [ ] 4.3 Testing & merge to dev

## Branch
`feature/role-permissions` → merge to `dev`
