# Baby Kingdom Admin

Baby Kingdom 论坛自动化运营管理系统，从 Google Apps Script 完整迁移到 Vue 3 + Node.js + MongoDB 独立后台。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Element Plus + Pinia + Vue Router |
| 后端 | Express + Mongoose + BullMQ + Socket.io |
| AI | Google AI SDK (`@google/generative-ai`) |
| 数据库 | MongoDB 7 |
| 缓存/队列 | Redis 7 |
| 部署 | Docker Compose |

## 项目结构

```
baby-kingdom-new/
├── backend/                # Express API 后端
├── frontend/               # Vue 3 前端
├── docker-compose.yml      # Docker Compose (开发)
├── docker-compose.production.yml  # 生产环境覆盖
├── .env.example            # 环境变量模板
├── .env.development        # 开发环境变量 (不提交 git)
└── docs/
    ├── superpowers/specs/  # 设计文档
    ├── superpowers/plans/  # 实施计划
    └── figma-make-prompts.md  # UI 设计 prompts
```

## 本地开发

### 前置条件

- Node.js >= 20
- MongoDB 7 (本地运行)
- Redis 7 (本地运行)

```bash
# 安装 MongoDB 和 Redis (macOS)
brew tap mongodb/brew
brew install mongodb-community@7.0 redis

# 启动服务
brew services start mongodb-community@7.0
brew services start redis
```

### 启动后端

```bash
cd backend
cp ../.env.development .env
npm install
npm run dev          # 开发模式 (自动重启)
npm run test         # 运行测试 (108 tests)
```

后端启动后访问:
- API: http://localhost:3000
- 健康检查: http://localhost:3000/api/health

### 启动前端

```bash
cd frontend
npm install
npm run dev          # 开发模式
npm run build        # 生产构建
```

前端启动后访问: http://localhost:5173

### 默认管理员账号

```
Email:    admin@dev.local
Password: admin123
```

## Docker 部署

```bash
# 开发环境
docker-compose up -d

# 生产环境
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

## API 概览

| 模块 | 路径前缀 | 端点数 |
|------|---------|--------|
| Health | `/api/health` | 1 |
| Auth | `/api/v1/auth` | 9 |
| Config | `/api/v1/configs` | 3 |
| Tone Modes | `/api/v1/tones` | 5 |
| Personas | `/api/v1/personas` | 5 |
| Topic Rules | `/api/v1/topic-rules` | 5 |
| Forum | `/api/v1/forums` | 8 |
| Scanner | `/api/v1/scanner` | 2 |
| Trends | `/api/v1/trends` | 5 |
| Feeds | `/api/v1/feeds` | 10 |
| Poster | `/api/v1/poster` | 2 |
| Queues | `/api/v1/queues` | 7 |
| Dashboard | `/api/v1/dashboard` | 4 |
| Audit | `/api/v1/audits` | 1 |
