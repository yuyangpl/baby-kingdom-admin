# Baby Kingdom Admin — Frontend

Vue 3 + Element Plus + Pinia 管理后台前端。

## 项目结构

```
frontend/
├── src/
│   ├── main.js                           # 入口: Vue + Pinia + Router + Element Plus
│   ├── App.vue                           # 根组件 (router-view)
│   ├── api/
│   │   └── index.js                      # Axios 实例 (JWT 自动刷新拦截器)
│   ├── socket/
│   │   └── index.js                      # Socket.io 客户端 (room 订阅/退订)
│   ├── stores/
│   │   └── auth.js                       # 认证 store (login/logout/fetchMe)
│   ├── router/
│   │   └── index.js                      # 路由 + 权限守卫 (admin/editor/viewer)
│   ├── components/
│   │   └── AppLayout.vue                 # 主布局: 侧边栏 + 顶栏 + 内容区
│   └── views/
│       ├── login/LoginView.vue           # 登录页
│       ├── dashboard/DashboardView.vue   # 仪表盘 (队列状态/今日统计/动态/趋势)
│       ├── feed/FeedView.vue             # Feed Queue (列表/审核/批量)
│       ├── scanner/ScannerView.vue       # Scanner (触发/历史)
│       ├── trends/TrendsView.vue         # Trends (触发/列表/MediaLens OTP)
│       ├── poster/PosterView.vue         # Poster (发帖历史)
│       ├── persona/PersonaView.vue       # Persona 管理 (卡片网格)
│       ├── tone/ToneView.vue             # Tone Modes 管理 (表格)
│       ├── topic-rules/TopicRulesView.vue # Topic Rules 管理 (表格)
│       ├── forum/ForumView.vue           # Forum 版块 (树形配置)
│       ├── config/ConfigView.vue         # System Config (Tab 分组)
│       ├── queue/QueueView.vue           # Queue Monitor (状态卡片/暂停/恢复)
│       ├── audit/AuditView.vue           # Audit Log (表格/筛选)
│       └── user/UserView.vue             # User Management (Admin only)
├── public/
├── index.html
├── vite.config.js                        # Vite 配置 + API/Socket 代理
├── nginx.conf                            # 生产 Nginx (SPA + API + WebSocket 代理)
├── Dockerfile                            # 多阶段构建 (build + nginx)
└── package.json
```

## 脚本说明

```bash
npm install          # 安装依赖
npm run dev          # 开发模式 (Vite, http://localhost:5173)
npm run build        # 生产构建 (输出到 dist/)
npm run preview      # 预览生产构建
```

## 开发代理

`vite.config.js` 已配置开发代理, 所有 `/api` 和 `/socket.io` 请求自动转发到后端 `http://localhost:3000`:

```javascript
proxy: {
  '/api': { target: 'http://localhost:3000' },
  '/socket.io': { target: 'http://localhost:3000', ws: true },
}
```

## 页面说明

| 页面 | 路径 | 权限 | 功能 |
|------|------|------|------|
| Login | `/login` | 公开 | 登录 |
| Dashboard | `/` | viewer+ | 实时状态、今日统计、动态、趋势图 |
| Feed Queue | `/feeds` | editor+ | Feed 列表、审核、Claim、批量操作、自定义生成 |
| Scanner | `/scanner` | editor+ | 手动触发扫描、扫描历史 |
| Trends | `/trends` | editor+ | 手动拉取、趋势列表、MediaLens OTP |
| Poster | `/poster` | editor+ | 发帖历史 |
| Personas | `/personas` | viewer+ | Persona 列表 (Admin 可编辑) |
| Tone Modes | `/tones` | viewer+ | 语气管理 (Admin 可编辑) |
| Topic Rules | `/topic-rules` | viewer+ | 话题规则 (Admin 可编辑) |
| Forum Boards | `/forums` | viewer+ | 版块树形配置 (Admin 可编辑) |
| Config | `/config` | admin | 系统设置 (分 Tab 显示, 敏感值脱敏) |
| Queue Monitor | `/queues` | viewer+ | 队列状态、暂停/恢复、手动触发 |
| Audit Log | `/audit` | admin | 操作日志筛选查看 |
| Users | `/users` | admin | 用户管理、角色变更 |

## 权限体系

**路由级守卫:** `router/index.js` 中 `meta.role` 定义最低角色要求, `beforeEach` 全局守卫校验。

**角色层级:** admin (3) > editor (2) > viewer (1)

- viewer 访问 editor 页面 → 重定向到 Dashboard
- 未登录 → 重定向到 Login

**Axios 拦截器:** 401 自动调用 `/auth/refresh` 无感续期, 失败跳转登录页。

## Socket.io

客户端封装在 `socket/index.js`:

- `initSocket()` — 创建连接 (自动重连)
- `connectSocket()` — 附带 JWT 连接
- `useSocketRoom(name)` — 进入页面 join room, 离开 leave

事件: `feed:new`, `feed:statusChanged`, `feed:claimed`, `feed:unclaimed`, `queue:status`, `queue:progress`, `scanner:result`, `trends:new`

## 生产部署

Dockerfile 多阶段构建:

1. `node:20-alpine` — `npm ci` + `npm run build`
2. `nginx:1.27-alpine` — 复制 `dist/` + `nginx.conf`

Nginx 配置: SPA fallback, API 代理到 backend:3000, WebSocket 代理, gzip, 静态资源缓存 30 天。
