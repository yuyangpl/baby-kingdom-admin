# Baby Kingdom Admin — Backend

Express + Mongoose + BullMQ 模块化单体后端。

## 项目结构

```
backend/
├── src/
│   ├── server.js                         # HTTP 入口 + graceful shutdown
│   ├── app.js                            # Express 初始化 + 中间件 + 路由注册
│   ├── worker.js                         # Worker 入口 (BullMQ 消费者)
│   ├── shared/
│   │   ├── database.js                   # MongoDB 连接
│   │   ├── redis.js                      # Redis 连接 + connectRedis()
│   │   ├── logger.js                     # pino 日志
│   │   ├── response.js                   # 统一响应 (success/paginated/created)
│   │   ├── errors.js                     # 自定义错误 (6 种)
│   │   ├── crud.js                       # CRUD 工厂函数 (自动审计日志)
│   │   └── middleware/
│   │       ├── auth.js                   # JWT authenticate + role authorize
│   │       ├── error-handler.js          # 全局错误处理
│   │       ├── not-found.js              # 404 处理
│   │       └── request-logger.js         # HTTP 请求日志
│   └── modules/
│       ├── health/                       # GET /api/health
│       │   ├── health.controller.js
│       │   └── health.routes.js
│       ├── auth/                         # /api/v1/auth — JWT 双 Token + 用户 CRUD
│       │   ├── auth.model.js             # User Schema (bcrypt)
│       │   ├── auth.service.js           # login/register/refresh/logout/seedAdmin
│       │   ├── auth.controller.js
│       │   └── auth.routes.js
│       ├── config/                       # /api/v1/configs — 系统设置 (AES 加密)
│       │   ├── config.model.js
│       │   ├── config.service.js         # encrypt/decrypt/mask secrets
│       │   ├── config.controller.js
│       │   └── config.routes.js
│       ├── tone/                         # /api/v1/tones — 回复语气 CRUD
│       │   ├── tone.model.js
│       │   └── tone.routes.js            # 使用 buildCrud 工厂
│       ├── persona/                      # /api/v1/personas — 虚拟角色 CRUD
│       │   ├── persona.model.js
│       │   └── persona.routes.js
│       ├── topic-rules/                  # /api/v1/topic-rules — 话题规则 CRUD
│       │   ├── topic-rules.model.js
│       │   └── topic-rules.routes.js
│       ├── forum/                        # /api/v1/forums — 版块管理
│       │   ├── forum.model.js            # ForumCategory + ForumBoard + PersonaBindings
│       │   ├── forum.service.js          # 树形查询 + CRUD + Persona 关联
│       │   ├── forum.controller.js
│       │   └── forum.routes.js
│       ├── gemini/                       # AI 核心 (无 HTTP 路由)
│       │   ├── gemini.service.js         # Gemini SDK 调用 (mock fallback)
│       │   ├── prompt.builder.js         # 6 层 Prompt 组装 + 语气优先级链
│       │   ├── google-trends.service.js  # Google Trends 匹配
│       │   └── quality-guard.js          # 内容质量检测 + 重复检查
│       ├── scanner/                      # /api/v1/scanner — 论坛扫描
│       │   ├── scanner.service.js        # 7 层过滤 + 2 熔断 + 两步 Gemini
│       │   ├── scanner.controller.js
│       │   └── scanner.routes.js
│       ├── trends/                       # /api/v1/trends — 趋势拉取 + MediaLens OTP
│       │   ├── trends.model.js
│       │   ├── trends.service.js
│       │   ├── trends.controller.js
│       │   └── trends.routes.js
│       ├── feed/                         # /api/v1/feeds — Feed Queue 管理
│       │   ├── feed.model.js             # 30+ 字段, 6 索引
│       │   ├── feed.service.js           # CRUD + claim + approve/reject + batch + regenerate
│       │   ├── feed.controller.js
│       │   └── feed.routes.js
│       ├── poster/                       # /api/v1/poster — BK 论坛发帖
│       │   ├── poster.service.js         # 登录 + 发帖 + 频率限制 (35s)
│       │   ├── poster.controller.js
│       │   └── poster.routes.js
│       ├── queue/                        # /api/v1/queues — BullMQ 队列管理
│       │   ├── queue.model.js            # QueueJob 执行记录
│       │   ├── queue.service.js          # 6 队列: init/pause/resume/trigger/history
│       │   ├── queue.controller.js
│       │   └── queue.routes.js
│       ├── dashboard/                    # /api/v1/dashboard — 仪表盘
│       │   ├── dashboard.model.js        # DailyStats (预计算)
│       │   ├── dashboard.service.js      # realtime/today/recent/weekly + 聚合
│       │   ├── dashboard.controller.js
│       │   └── dashboard.routes.js
│       └── audit/                        # /api/v1/audits — 操作日志
│           ├── audit.model.js            # TTL 自动清理
│           ├── audit.service.js
│           ├── audit.controller.js
│           └── audit.routes.js
├── tests/
│   ├── setup.js                          # 测试环境变量
│   ├── helpers.js                        # setupDB/teardownDB/request/expect helpers
│   └── modules/                          # 按模块组织的集成测试 (108 tests)
│       ├── health/health.test.js
│       ├── auth/auth.test.js
│       ├── config/config.test.js
│       ├── tone/tone.test.js
│       ├── persona/persona.test.js
│       ├── topic-rules/topic-rules.test.js
│       ├── forum/forum.test.js
│       ├── gemini/gemini.test.js
│       ├── scanner/scanner.test.js
│       ├── trends/trends.test.js
│       ├── feed/feed.test.js
│       ├── queue/queue.test.js
│       ├── dashboard/dashboard.test.js
│       └── audit/audit.test.js
├── jest.config.js
├── Dockerfile
└── package.json
```

## 脚本说明

```bash
npm run dev          # 开发模式 (node --watch, 文件变更自动重启)
npm run start        # 生产模式
npm run test         # 运行全部测试 (Jest, 108 tests)
npm run test:watch   # 测试监听模式
npm run worker       # 启动 Worker 进程
```

## 环境变量

从根目录复制 `.env.development` 到 `backend/.env`:

```bash
cp ../.env.development .env
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 环境 | development |
| `PORT` | API 端口 | 3000 |
| `MONGO_URI` | MongoDB 连接串 | mongodb://localhost:27017/baby-kingdom-dev |
| `REDIS_HOST` | Redis 主机 | localhost |
| `REDIS_PORT` | Redis 端口 | 6379 |
| `JWT_SECRET` | JWT 签名密钥 | — |
| `JWT_ACCESS_EXPIRES_IN` | Access Token 有效期 | 30m |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token 有效期 | 7d |
| `ENCRYPTION_KEY` | AES 加密密钥 (32 字符) | — |
| `ADMIN_USERNAME` | 初始管理员用户名 | admin |
| `ADMIN_EMAIL` | 初始管理员邮箱 | admin@dev.local |
| `ADMIN_PASSWORD` | 初始管理员密码 | admin123 |

## 模块约定

每个模块统一结构:

```
modules/<name>/
├── <name>.model.js        # Mongoose Schema
├── <name>.service.js      # 业务逻辑
├── <name>.controller.js   # 请求处理 (调用 service, 返回 response)
├── <name>.routes.js       # Express Router
└── <name>.validator.js    # 输入校验 (可选)
```

简单 CRUD 模块使用 `shared/crud.js` 工厂函数, 自动生成 list/getById/create/update/remove 并记录审计日志。

## 错误处理

统一响应格式:

```json
// 成功
{ "success": true, "data": { ... } }
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 100, "pages": 5 } }

// 错误
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

自定义错误类: `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `BusinessError` (422)。

## 认证

- Access Token: 30 分钟, Bearer header
- Refresh Token: 7 天, HttpOnly Cookie
- 角色: admin / editor / viewer
- 自动刷新: 前端 Axios 拦截器处理 401 → 调用 `/auth/refresh`
