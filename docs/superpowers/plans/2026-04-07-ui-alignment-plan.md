# UI 设计对齐计划 — Figma → Vue 3 + Element Plus

## 概览

基于 Figma Dev Mode 导出的设计稿（React + shadcn/ui + Tailwind），将当前 Vue 3 + Element Plus 前端代码调整为与设计一致，同时纳入 UI/UX Pro Max 专家优化建议。

**原则：** 保留 Element Plus 组件库，通过 CSS 变量覆盖 + 自定义样式对齐 Figma 设计，不替换底层框架。

---

## UI/UX Pro Max 优化建议

基于 `ui-ux-pro-max` 专家分析，以下优化一并纳入：

### 色彩系统（CRM Management 色板 — WCAG AA 合规）
| Token | 值 | 用途 |
|-------|------|------|
| `--bk-primary` | `#2563EB` | 主操作按钮、侧边栏活跃态 |
| `--bk-primary-hover` | `#1D4ED8` | 按钮 hover |
| `--bk-secondary` | `#3B82F6` | 次要操作 |
| `--bk-accent` | `#059669` | 成功/确认 |
| `--bk-background` | `#F8FAFC` | 页面背景 |
| `--bk-foreground` | `#0F172A` | 主文字 |
| `--bk-muted` | `#F1F5FD` | 禁用/占位 |
| `--bk-muted-fg` | `#64748B` | 次要文字 |
| `--bk-border` | `#E4ECFC` | 边框 |
| `--bk-destructive` | `#DC2626` | 危险操作 |
| `--bk-sidebar` | `#304156` | 侧边栏背景 |

### 交互优化（UX Guidelines）
| 规则 | 实施 |
|------|------|
| **骨架屏加载** | 所有页面首次加载显示 skeleton 而非空白 |
| **Hover 反馈 150-300ms** | 所有可点击元素 `transition: all 0.2s ease` |
| **脉冲状态指示** | 运行中的服务/队列用 `animate-pulse` 绿点 |
| **表格行 hover** | `hover:bg-gray-50` 行高亮 |
| **按钮加载态** | 异步操作时 disabled + spinner |
| **空状态** | 无数据时显示插画 + 引导操作按钮 |
| **prefers-reduced-motion** | 动画时长尊重用户偏好设置 |
| **Focus 可见性** | 所有交互元素可见 focus ring（2-4px） |

### 布局优化
| 规则 | 实施 |
|------|------|
| **侧边栏折叠按钮** | 从底部移到顶部 Header 区域（用户要求） |
| **Header 固定 64px** | 统一所有页面 header 高度 |
| **内容最大宽度** | 超大屏幕限制 `max-w-7xl` 避免拉伸 |
| **响应式断点** | 375 / 768 / 1024 / 1440 四级 |
| **固定元素偏移** | Header 固定时内容区预留 padding-top |

### 可访问性
| 规则 | 实施 |
|------|------|
| **颜色对比 4.5:1** | 所有文字色满足 WCAG AA |
| **不依赖颜色传达信息** | 状态用颜色+图标+文字三重表达 |
| **键盘导航** | Tab 顺序跟随视觉顺序 |
| **aria-label** | 图标按钮必须有 aria-label |

---

## 实施计划

### Phase A: 全局样式基础（CSS 变量 + 主题 + 布局）

| Task | 内容 |
|------|------|
| A1 | 创建 `frontend/src/styles/variables.css` — 设计 token（上述色板、圆角 10px、阴影、间距 8dp） |
| A2 | 覆盖 Element Plus 主题变量 — `--el-color-primary: #2563EB`, `--el-color-danger: #DC2626`, `--el-border-radius-base: 10px` 等 |
| A3 | 创建全局工具类 `.css` — 状态色、Tier 色、脉冲动画、skeleton、渐变头像、左彩色边框 |
| A4 | 更新 `AppLayout.vue` — **侧边栏折叠按钮移到 Header 左侧**（hamburger 图标）、分组标题改为平铺灰色小标题、活跃态 `bg-[#2563EB]`、Header 固定 h-16 |

### Phase B: 核心页面对齐（5 个页面）

| Task | 页面 | 主要改动 |
|------|------|----------|
| B1 | **Login** | 渐变背景 `from-blue-50 via-white to-blue-50`、蓝色圆形 logo 头像、图标前缀输入框、密码显隐 Eye 图标、skeleton 加载 |
| B2 | **Dashboard** | 4 区布局：① 5 列实时状态卡（脉冲绿点）② 5 列今日统计 ③ 左 2/3 活动时间线 + 右 1/3 版块趋势条形图 ④ 左 3/5 质量指标 + 右 2/5 系统健康（4 服务状态） |
| B3 | **FeedQueue** | 卡片式列表（替代纯表格）、左边框 Tier 色（绿/橙/红）、右侧人设信息卡 `bg-blue-50`、新 Feed 蓝色横幅、认领锁图标+倒计时、Approve 绿色/Reject 红色按钮 |
| B4 | **Personas** | 3 列卡片网格、渐变头像 `from-blue-400 to-blue-600`、右上角 Token 状态绿/红点、`h-2` 发帖进度条、archetype 彩色标签 |
| B5 | **Config** | 7 tab 精确表单、密钥字段 Eye 图标、MediaLens tab OTP 请求/验证 UI、Email tab 测试邮件按钮、表单分组间距 |

### Phase C: 其余页面对齐（8 个页面）

| Task | 页面 | 主要改动 |
|------|------|----------|
| C1 | **Scanner** | 触发按钮+状态卡、历史表格 hover 行高亮、状态彩色 Badge |
| C2 | **Trends** | 数据源 Switch 卡、Token 状态指示、行背景色（正面绿/负面粉） |
| C3 | **Poster** | 播放/暂停控制、等待/成功/失败指标卡、双表格（待发/历史） |
| C4 | **ToneModes** | 可展开行（ChevronDown 图标）、展开区 `bg-gray-50` 详情、Switch 启用控件 |
| C5 | **TopicRules** | 关键词 tag chips + 溢出 "+N" 灰色 badge、Tier 彩色 badge |
| C6 | **ForumBoards** | 左 1/4 树形列表 + 右 3/4 详情表单、选中项 `bg-blue-100`、scraping 绿/灰点 |
| C7 | **QueueMonitor** | 5 列状态卡 + 脉冲 Live 指示器、任务历史表格、失败项 Retry 按钮 |
| C8 | **AuditLog + Users** | Audit: 可展开 diff（红/绿对比）、模块彩色标签; Users: 角色说明卡（红/蓝/灰左边框）、渐变头像、当前用户 "You" 标记 |

---

## 预估规模

| Phase | 文件数 | 复杂度 | 说明 |
|-------|--------|--------|------|
| A: 全局样式 | 3-4 | 中 | CSS 变量 + 布局调整 |
| B: 核心页面 | 5 | 大 | Dashboard 和 FeedQueue 最复杂 |
| C: 其余页面 | 8 | 中 | 大部分是样式微调 |
| **合计** | **~16** | — | — |

## 关键变更：侧边栏折叠

**之前：** 折叠按钮在侧边栏底部
**之后：** 折叠按钮移到顶部 Header 左侧（hamburger 图标 ☰），点击切换侧边栏展开/收起

```
┌──────────┬─────────────────────────────────────┐
│ BK Admin │ ☰  Baby Kingdom Admin    🔔 EN 👤  │  ← Header (h-16)
├──────────┼─────────────────────────────────────┤
│ OVERVIEW │                                     │
│ Dashboard│          Content Area               │
│ CONTENT  │                                     │
│ Feed ... │                                     │
│ Scanner  │                                     │
│ ...      │                                     │
└──────────┴─────────────────────────────────────┘
```

收起状态：
```
┌────┬──────────────────────────────────────────┐
│ BK │ ☰  Baby Kingdom Admin    🔔 EN 👤       │
├────┼──────────────────────────────────────────┤
│ 📊 │                                          │
│ 📄 │            Content Area                  │
│ 🔍 │                                          │
│ ...│                                          │
└────┴──────────────────────────────────────────┘
```
