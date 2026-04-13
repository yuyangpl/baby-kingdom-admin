# Plan: Multi-User Role Permissions

## Goal
实现 4 级角色权限体系，控制菜单可见性和操作权限，Feed 指派机制隔离审批数据。

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
| View Feeds | Y (all) | Y (assigned) | Y (assigned) | Y (read-only, assigned) |
| Edit Feed Content | Y | Y (assigned) | N | N |
| Approve/Reject Feed | Y | N | Y (assigned) | N |
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

### Phase 2: Backend Role Extension ✅ DONE
- [x] 2.1 Prisma schema — User.role 注释更新为 `admin | editor | approver | viewer`
- [x] 2.2 DB schema 同步 (prisma db push) — assignedTo 字段 + 索引
- [x] 2.3 auth middleware + express.d.ts — role 类型扩展加 `'approver'`
- [x] 2.4 Route guards — 各模块路由权限重新分配
- [x] 2.5 dashboard 路由加 `meta: { role: 'admin' }`
- [x] 2.6 auth controller — role 校验支持 approver
- [x] 2.7 移除 claim/unclaim（service 函数 + 路由 + 前端按钮）

### Phase 3: Feed Assignment（数据隔离） ✅ DONE
- [x] 3.1 Feed model — assignedTo/assignedAt + User relation + 索引
- [x] 3.2 autoAssignFeed() — 负载均衡分配，fallback admin
- [x] 3.3 approve/reject — assignedTo 校验（admin 豁免）
- [x] 3.4 PUT /feeds/:id/assign — admin 手动重新指派
- [x] 3.5 Feed list — 非 admin 自动过滤 assignedTo=userId
- [x] 3.6 FeedView — 按角色控制操作按钮（canApprove 计算属性）

### Phase 4: Cleanup ✅ DONE
- [x] 4.1 Seed data — admin 默认角色不变（无需改动）
- [x] 4.2 UserForm — 角色选项支持 4 个 + i18n
- [x] 4.3 已合并到 dev

## Technical Notes

- **authorize() 是白名单模式**，不是层级继承。每个路由需显式列出允许的角色。
- **JWT token 中已包含 role**，前端 auth store 从 token/user 读取角色。
- **assignedTo 是唯一的数据隔离机制**：决定谁能看到和操作哪些 feed。
- **claim 机制废弃**：不再需要临时锁，assignedTo 直接决定数据归属。claimedBy/claimedAt 字段暂保留兼容，后续可清理。

## Branch
`feature/role-permissions` → merge to `dev`
