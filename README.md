# Baby Kingdom Admin

BK 论坛自动化运营后台 — Vue 3 + Express + MongoDB + Redis + BullMQ

## 快速开始

### 方式一：Docker 部署（推荐）

**前置条件：** 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 一键启动（首次会自动构建镜像 + 初始化数据）
docker compose up -d

# 查看所有服务状态
docker compose ps

# 查看日志
docker compose logs -f           # 所有服务
docker compose logs -f backend   # 仅 backend
docker compose logs -f worker    # 仅 worker
```

启动后访问：
- **前端界面：** http://localhost:8080
- **后端 API：** http://localhost:3001
- **默认账号：** yu.yang@mintinglabs.com / presslogic

**自动初始化数据：**
- 1 个 Admin 用户、46 项系统配置
- 5 个语气模式、30 个人设、22 条话题规则
- 6 个版块分类 + 34 个版块

> Docker 默认暂停所有队列，需在前端「队列管理」页面手动恢复。

#### 常用命令

```bash
# 停止服务（保留数据）
docker compose down

# 停止服务并重置数据库
docker compose down -v

# 重建镜像（代码修改后）
docker compose up --build -d

# 重建单个服务
docker compose up --build -d backend
docker compose up --build -d worker

# 重置数据库并重启
docker compose down -v && docker compose up -d
```

#### 端口映射

| 服务 | 宿主机端口 | 容器内部端口 |
|------|-----------|-------------|
| Frontend (Nginx) | 8080 | 80 |
| Backend (Express) | 3001 | 3000 |
| MongoDB | 27018 | 27017 |
| Redis | 6380 | 6379 |

> 端口已与本地开发错开，两套可同时运行。

#### 环境变量 (.env.docker)

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PAUSE_QUEUES_ON_START` | 启动时暂停所有队列 | `true` |
| `MONGO_URI` | MongoDB 连接 | `mongodb://mongodb:27017/baby-kingdom-dev` |
| `REDIS_HOST` | Redis 地址 | `redis` |

---

### 方式二：本地开发

**前置条件：** Node.js >= 20.19, MongoDB 7, Redis 7

```bash
# 安装 MongoDB 和 Redis (macOS)
brew tap mongodb/brew
brew install mongodb-community@7.0 redis

# 启动基础服务
brew services start mongodb-community@7.0
brew services start redis

# 后端 API
cd backend && cp ../.env.development .env && npm install && npm run dev

# Worker（新终端）
cd backend && npm run worker

# 前端（新终端）
cd frontend && npm install && npm run dev
```

启动后访问：
- **前端界面：** http://localhost:5173
- **后端 API：** http://localhost:3000
- **默认账号：** yu.yang@mintinglabs.com / presslogic

---

## 项目结构

```
baby-kingdom-new/
├── backend/              # Express API (14 模块, 65+ 端点)
│   ├── src/
│   │   ├── modules/      # 业务模块 (auth, feed, scanner, poster, trends...)
│   │   ├── shared/       # 公共工具 (database, redis, socket, errors...)
│   │   ├── seeds/        # 种子数据 (config, persona, tone, rule, forum)
│   │   ├── server.ts     # API 服务入口
│   │   └── worker.ts     # 队列处理 + 定时任务
│   └── Dockerfile
├── frontend/             # Vue 3 SPA (13 页面)
│   ├── src/
│   │   ├── views/        # 页面组件
│   │   ├── stores/       # Pinia 状态管理
│   │   ├── router/       # 路由 + 权限守卫
│   │   └── api/          # Axios (JWT 自动刷新)
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml    # Docker 编排 (5 服务)
├── .env.docker           # Docker 环境变量
├── .env.development      # 本地开发环境变量
└── docs/                 # 设计文档
```

## 技术栈

| 层 | 技术 |
|---|------|
| Frontend | TypeScript + Vue 3 + Element Plus + Pinia + Vue Router |
| Backend | TypeScript + Express + Mongoose + BullMQ + Socket.io |
| Database | MongoDB 7 + Redis 7 |
| AI | Google Gemini (@google/generative-ai) |
| Deploy | Docker Compose |

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

## 测试

```bash
cd backend && npm test    # 集成测试 (Jest)
```
