# Baby Kingdom Admin — Project Rules

## Project Overview

BK论坛自动化运营后台，从 Google Apps Script 完整迁移到 Vue 3 + Express + MongoDB。
系统自动扫描论坛低回复帖子，用 Gemini AI 生成回复，管理员审核后发布到 Baby Kingdom 论坛。

## Tech Stack

- **Backend:** TypeScript + Express + Mongoose + BullMQ + Socket.io (ES Modules, compiled to dist/)
- **Frontend:** TypeScript + Vue 3 + Element Plus + Pinia + Vue Router (Vite)
- **Database:** MongoDB 7 + Redis 7
- **AI:** Google AI SDK for Node.js (@google/generative-ai), mock fallback when no API key
- **Deploy:** Docker Compose

## Project Structure

```
baby-kingdom-new/
├── backend/          # Express API (14 modules, 65+ endpoints)
├── frontend/         # Vue 3 SPA (13 pages)
├── docker-compose.yml
├── docs/             # Design specs, plans, Figma prompts
└── doc/              # Supplementary docs
```

## Development Setup

```bash
# Prerequisites: MongoDB + Redis running locally
brew services start mongodb-community@7.0
brew services start redis

# Backend
cd backend && cp ../.env.development .env && npm install && npm run dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev

# Default admin: admin@dev.local / admin123
```

## Backend Conventions

### Module Structure
每个模块在 `backend/src/modules/<name>/` 下，统一结构：
- `<name>.model.ts` — Mongoose Schema
- `<name>.service.ts` — 业务逻辑
- `<name>.controller.ts` — 请求处理
- `<name>.routes.ts` — Express Router

简单 CRUD 模块使用 `shared/crud.ts` 工厂函数。

### Response Format
```json
{ "success": true, "data": {} }
{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 100, "pages": 5 } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

### Error Classes
使用 `shared/errors.ts` 中的自定义错误：
- `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403)
- `NotFoundError` (404), `ConflictError` (409), `BusinessError` (422)

### Auth
- JWT dual-token: Access (30min Bearer header) + Refresh (7d HttpOnly cookie)
- 角色: admin > editor > viewer
- Middleware: `authenticate` (验证 JWT) + `authorize('admin', 'editor')` (角色检查)

### Route Registration
新模块路由在 `backend/src/app.ts` 中注册：
```typescript
import xxxRoutes from './modules/xxx/xxx.routes.js';
app.use('/api/v1/xxx', xxxRoutes);
```
**注意：** 静态路由必须在参数化路由之前（如 `/batch/approve` 在 `/:id/approve` 之前）。

### Audit Logging
所有 CRUD 操作通过 `auditService.log()` 记录审计日志。
使用 `buildCrud()` 工厂函数的模块自动记录。

### Config
业务配置存 MongoDB `configs` 集合（46 项预置），通过 `configService.getValue(key)` 读取。
敏感配置 (`isSecret: true`) AES 加密存储。
基础设施配置在 `.env` 文件中（`.env.development` 为开发环境默认）。

## Frontend Conventions

### API Calls
使用 `src/api/index.ts` 的 Axios 实例，自动附带 JWT、401 自动刷新。
```typescript
import api from '../../api';
const res = await api.get('/v1/feeds');
// res.data = [...], res.pagination = {...}
```

### Permission
- 路由级: `router/index.ts` 的 `meta.role` + `beforeEach` 守卫
- 组件级: 用 `v-if="auth.isAdmin"` 控制按钮显隐

### Socket.io
- `socket/index.ts` 管理连接，`socket/listeners.ts` 注册事件
- AppLayout 在 mount 时连接，unmount 时断开
- 8 个事件: feed:new/statusChanged/claimed/unclaimed, queue:status/progress, scanner:result, trends:new

### CRUD 模式
列表页 + 弹窗表单组件：
- Form 组件接收 `modelValue` (boolean) + `editData` (null=create, object=edit)
- emit `saved` 事件让父组件刷新列表

## Testing

```bash
cd backend && npm test    # 108 integration tests, Jest
```
测试使用真实 MongoDB (`baby-kingdom-test` 库) + Redis。
每个测试套件使用唯一 email 避免并行冲突。

## Data Seeding

```bash
# 首次启动自动 seed 46 项 config + admin 用户
# 手动导入 30 Persona + 5 Tone + 12 Rules + 34 Boards:
cd backend && npx tsx src/seeds/import-data.ts
```

## Key Design Decisions

- **模块化 Monolith:** 按业务领域分模块，未来可拆微服务
- **两步 Gemini 调用:** Scanner 先评估(低成本)再生成(仅命中)，节省 ~93% Token
- **7 层过滤 + 2 熔断:** 前 4 层不消耗 Token，队列满/超时自动停止
- **语气优先级链:** Tier3 强制 → 负面情感 → 规则指定 → 人设主语气 → 默认
- **Worker Leader Election:** Redis 分布式锁确保 cron 只在一个 Worker 实例运行
- **Poster 串行发帖:** BullMQ concurrency:1 + 35s limiter，匹配 BK 论坛限频

## BK Forum API

基础 URL: `https://bapi.baby-kingdom.com/index.php`
所有请求通过 `mod` + `op` 参数路由：
- `mod=member&op=login` — 登录
- `mod=forum&op=forumdisplay` — 版块帖子列表
- `mod=forum&op=viewthread` — 帖子详情
- `mod=forum&op=newthread` — 发新帖
- `mod=forum&op=newreply` — 回帖
- `mod=forum&op=index` — 版块索引

限频: 35s 间隔，频繁发帖自动 sleep 32s + 重试（最多 2 次）。
