# Plan 1: Foundation — Project Scaffold & Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Docker Compose infrastructure, Express backend scaffold with modular monolith structure, MongoDB/Redis connections, shared middleware, health check endpoint, and environment configuration.

**Architecture:** Modular monolith Express backend with unified module structure (routes/controller/service/model/validator per module). Docker Compose orchestrates 5 containers (frontend/backend/worker/mongodb/redis). Backend and Worker share the same codebase but different entry points.

**Tech Stack:** Node.js 20, Express, Mongoose 8, Redis (ioredis), BullMQ, Docker Compose, pino (logging)

---

## File Structure

```
baby-kingdom-new/
├── .gitignore
├── .env.example
├── .env.development
├── docker-compose.yml
├── docker-compose.production.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── server.js                    # HTTP server entry point
│   │   ├── app.js                       # Express app setup, middleware, module registration
│   │   ├── shared/
│   │   │   ├── database.js              # Mongoose connection
│   │   │   ├── redis.js                 # ioredis connection
│   │   │   ├── logger.js                # pino logger
│   │   │   ├── response.js              # Unified response helpers
│   │   │   ├── errors.js                # Custom error classes
│   │   │   └── middleware/
│   │   │       ├── error-handler.js     # Global error middleware
│   │   │       ├── not-found.js         # 404 handler
│   │   │       └── request-logger.js    # HTTP request logging
│   │   └── modules/
│   │       └── health/
│   │           ├── health.routes.js
│   │           └── health.controller.js
│   └── tests/
│       ├── setup.js                     # Test setup (env, db connect/disconnect)
│       ├── helpers.js                   # Shared test utilities
│       └── modules/
│           └── health/
│               └── health.test.js
├── worker/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       └── index.js                     # Worker entry point (placeholder)
└── frontend/
    ├── Dockerfile
    └── nginx.conf
```

---

### Task 1: Git Init & .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/yangyu/Documents/AI-work/baby-kingdom-new
git init
```

- [ ] **Step 2: Create .gitignore**

```gitignore
# Dependencies
node_modules/

# Environment
.env
.env.development
.env.staging
.env.production

# Build
dist/
build/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Docker
mongo-data/
redis-data/

# Test
coverage/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: initialize repo with .gitignore"
```

---

### Task 2: Environment Configuration

**Files:**
- Create: `.env.example`
- Create: `.env.development`

- [ ] **Step 1: Create .env.example**

```env
# === Base ===
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# === MongoDB ===
MONGO_URI=mongodb://localhost:27017/baby-kingdom

# === Redis ===
REDIS_HOST=localhost
REDIS_PORT=6379

# === JWT ===
JWT_SECRET=change-me-to-a-random-64-char-string
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d

# === Encryption (AES-256 for isSecret configs) ===
ENCRYPTION_KEY=change-me-to-a-random-32-char-key

# === Initial Admin ===
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me
```

- [ ] **Step 2: Create .env.development**

```env
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

MONGO_URI=mongodb://localhost:27017/baby-kingdom-dev

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=dev-secret-key-do-not-use-in-production-1234567890
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d

ENCRYPTION_KEY=dev-encryption-key-32-chars!!

ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@dev.local
ADMIN_PASSWORD=admin123
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add environment configuration template"
```

---

### Task 3: Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.production.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: "3.9"

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - frontend-net
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env.development
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - frontend-net
      - backend-net
    restart: unless-stopped

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: ["node", "src/worker.js"]
    env_file:
      - .env.development
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "process.exit(0)"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - backend-net
    restart: unless-stopped

  mongodb:
    image: mongo:7.0.14
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - backend-net
    restart: unless-stopped

  redis:
    image: redis:7.4.1-alpine
    ports:
      - "6379:6379"
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend-net
    restart: unless-stopped

volumes:
  mongo-data:
  redis-data:

networks:
  frontend-net:
  backend-net:
```

- [ ] **Step 2: Create docker-compose.production.yml**

```yaml
version: "3.9"

services:
  backend:
    env_file:
      - .env.production
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M

  worker:
    env_file:
      - .env.production
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M

  mongodb:
    ports: []
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G

  redis:
    ports: []
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml docker-compose.production.yml
git commit -m "chore: add Docker Compose with health checks and network isolation"
```

---

### Task 4: Backend package.json & Dockerfile

**Files:**
- Create: `backend/package.json`
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create backend/package.json**

```json
{
  "name": "baby-kingdom-admin-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --experimental-vm-modules node_modules/.bin/jest --forceExit --detectOpenHandles",
    "test:watch": "node --experimental-vm-modules node_modules/.bin/jest --watch",
    "worker": "node src/worker.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "mongoose": "^8.8.0",
    "ioredis": "^5.4.0",
    "bullmq": "^5.20.0",
    "cors": "^2.8.5",
    "helmet": "^8.0.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@jest/globals": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create backend/Dockerfile**

```dockerfile
FROM node:20.12.2-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY src/ ./src/

FROM base AS production
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
```

- [ ] **Step 3: Install dependencies**

Run: `cd /Users/yangyu/Documents/AI-work/baby-kingdom-new/backend && npm install`

- [ ] **Step 4: Commit**

```bash
cd /Users/yangyu/Documents/AI-work/baby-kingdom-new
git add backend/package.json backend/package-lock.json backend/Dockerfile
git commit -m "chore: add backend package.json and Dockerfile"
```

---

### Task 5: Logger

**Files:**
- Create: `backend/src/shared/logger.js`

- [ ] **Step 1: Create logger**

```javascript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export default logger;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/shared/logger.js
git commit -m "feat: add pino logger with pretty-print in dev"
```

---

### Task 6: Database Connection

**Files:**
- Create: `backend/src/shared/database.js`

- [ ] **Step 1: Create database module**

```javascript
import mongoose from 'mongoose';
import logger from './logger.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI environment variable is required');

  mongoose.connection.on('connected', () => {
    isConnected = true;
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    logger.error({ err }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB disconnected');
  });

  await mongoose.connect(uri);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  isConnected = false;
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/shared/database.js
git commit -m "feat: add MongoDB connection module"
```

---

### Task 7: Redis Connection

**Files:**
- Create: `backend/src/shared/redis.js`

- [ ] **Step 1: Create redis module**

```javascript
import Redis from 'ioredis';
import logger from './logger.js';

let client = null;

export function getRedis() {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null, // required by BullMQ
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error({ err }, 'Redis connection error'));

  return client;
}

export async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}

export function isRedisConnected() {
  return client?.status === 'ready';
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/shared/redis.js
git commit -m "feat: add Redis connection module"
```

---

### Task 8: Unified Response Helpers & Custom Errors

**Files:**
- Create: `backend/src/shared/response.js`
- Create: `backend/src/shared/errors.js`

- [ ] **Step 1: Create response helpers**

```javascript
export function success(res, data = null, statusCode = 200) {
  const body = { success: true };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
}

export function paginated(res, data, pagination) {
  return res.status(200).json({
    success: true,
    data,
    pagination,
  });
}

export function created(res, data) {
  return success(res, data, 201);
}
```

- [ ] **Step 2: Create custom error classes**

```javascript
export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(message, fields = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class BusinessError extends AppError {
  constructor(message, code = 'BUSINESS_ERROR') {
    super(message, 422, code);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/response.js backend/src/shared/errors.js
git commit -m "feat: add unified response helpers and custom error classes"
```

---

### Task 9: Middleware

**Files:**
- Create: `backend/src/shared/middleware/error-handler.js`
- Create: `backend/src/shared/middleware/not-found.js`
- Create: `backend/src/shared/middleware/request-logger.js`

- [ ] **Step 1: Create error handler middleware**

```javascript
import logger from '../logger.js';
import { AppError } from '../errors.js';

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    const body = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    if (err.fields) body.error.fields = err.fields;
    return res.status(err.statusCode).json(body);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const fields = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields },
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'unknown';
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_KEY', message: `Duplicate value for ${field}` },
    });
  }

  logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}
```

- [ ] **Step 2: Create not-found handler**

```javascript
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}
```

- [ ] **Step 3: Create request logger middleware**

```javascript
import logger from '../logger.js';

export function requestLogger(req, res, done) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  done();
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/middleware/
git commit -m "feat: add error handler, 404 handler, and request logger middleware"
```

---

### Task 10: Health Check Module

**Files:**
- Create: `backend/src/modules/health/health.controller.js`
- Create: `backend/src/modules/health/health.routes.js`

- [ ] **Step 1: Create health controller**

```javascript
import { isDBConnected } from '../../shared/database.js';
import { isRedisConnected } from '../../shared/redis.js';

export function getHealth(req, res) {
  const mongoOk = isDBConnected();
  const redisOk = isRedisConnected();
  const healthy = mongoOk && redisOk;

  const body = {
    success: healthy,
    data: {
      status: healthy ? 'healthy' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
      },
    },
  };

  return res.status(healthy ? 200 : 503).json(body);
}
```

- [ ] **Step 2: Create health routes**

```javascript
import { Router } from 'express';
import { getHealth } from './health.controller.js';

const router = Router();

router.get('/', getHealth);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/health/
git commit -m "feat: add health check endpoint"
```

---

### Task 11: Express App

**Files:**
- Create: `backend/src/app.js`

- [ ] **Step 1: Create Express app with all middleware and module registration**

```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './shared/middleware/request-logger.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFound } from './shared/middleware/not-found.js';
import healthRoutes from './modules/health/health.routes.js';

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Parsing
app.use(express.json({ limit: '1mb' }));

// Logging
app.use(requestLogger);

// Routes
app.use('/api/health', healthRoutes);

// Error handling (must be after routes)
app.use(notFound);
app.use(errorHandler);

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/app.js
git commit -m "feat: add Express app with middleware and health route"
```

---

### Task 12: Server Entry Point

**Files:**
- Create: `backend/src/server.js`

- [ ] **Step 1: Create server with graceful shutdown**

```javascript
import 'dotenv/config';
import app from './app.js';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, disconnectRedis } from './shared/redis.js';
import logger from './shared/logger.js';

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  getRedis();

  const server = app.listen(PORT, () => {
    logger.info(`Backend listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectRedis();
      await disconnectDB();
      logger.info('Server shut down');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/server.js
git commit -m "feat: add server entry point with graceful shutdown"
```

---

### Task 13: Worker Entry Point (Placeholder)

**Files:**
- Create: `backend/src/worker.js`
- Create: `worker/Dockerfile`
- Create: `worker/package.json`

- [ ] **Step 1: Create worker entry point**

```javascript
import 'dotenv/config';
import { connectDB, disconnectDB } from './shared/database.js';
import { getRedis, disconnectRedis } from './shared/redis.js';
import logger from './shared/logger.js';

async function start() {
  await connectDB();
  getRedis();

  logger.info('Worker started');

  // Queue processors will be registered here in Plan 8

  const shutdown = async (signal) => {
    logger.info(`${signal} received, worker shutting down`);
    await disconnectRedis();
    await disconnectDB();
    logger.info('Worker shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start worker');
  process.exit(1);
});
```

- [ ] **Step 2: Create worker Dockerfile (points to backend codebase)**

Worker uses the same codebase as backend but different entry point. The `docker-compose.yml` already handles this by overriding the command. No separate worker directory needed — remove it from docker-compose and use the backend image with a different command (already done in Task 3).

Create a minimal placeholder for the worker directory:

```dockerfile
# worker/Dockerfile — Not used, worker runs from backend image
# See docker-compose.yml: worker service uses backend build with command override
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/worker.js
git commit -m "feat: add worker entry point placeholder with graceful shutdown"
```

---

### Task 14: Frontend Placeholder

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `frontend/public/index.html`

- [ ] **Step 1: Create Nginx config**

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Proxy Socket.io
    location /socket.io/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

- [ ] **Step 2: Create frontend Dockerfile**

```dockerfile
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
EXPOSE 80
```

- [ ] **Step 3: Create placeholder index.html**

```html
<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baby Kingdom Admin</title>
</head>
<body>
    <h1>Baby Kingdom Admin</h1>
    <p>Frontend will be built in Plan 9.</p>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: add frontend Nginx placeholder with proxy config"
```

---

### Task 15: Test Setup

**Files:**
- Create: `backend/tests/setup.js`
- Create: `backend/tests/helpers.js`
- Create: `backend/jest.config.js`

- [ ] **Step 1: Create jest config**

```javascript
export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  setupFilesAfterSetup: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  forceExit: true,
  detectOpenHandles: true,
};
```

- [ ] **Step 2: Create test setup**

```javascript
import { connectDB, disconnectDB } from '../src/shared/database.js';
import { disconnectRedis } from '../src/shared/redis.js';

beforeAll(async () => {
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/baby-kingdom-test';
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars!!';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  await connectDB();
});

afterAll(async () => {
  await disconnectRedis();
  await disconnectDB();
});
```

- [ ] **Step 3: Create test helpers**

```javascript
import { jest } from '@jest/globals';
import supertest from 'supertest';
import app from '../src/app.js';

export const request = supertest(app);

export function expectSuccess(res, statusCode = 200) {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(true);
}

export function expectError(res, statusCode, code) {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(false);
  expect(res.body.error.code).toBe(code);
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/jest.config.js backend/tests/setup.js backend/tests/helpers.js
git commit -m "feat: add Jest test setup with DB connection and helpers"
```

---

### Task 16: Health Check Tests

**Files:**
- Create: `backend/tests/modules/health/health.test.js`

- [ ] **Step 1: Write health check tests**

```javascript
import { request, expectSuccess } from '../../helpers.js';

describe('GET /api/health', () => {
  it('returns healthy status when MongoDB and Redis are connected', async () => {
    const res = await request.get('/api/health');

    expectSuccess(res);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.services.mongodb).toBe('connected');
    expect(res.body.data.services.redis).toBe('connected');
    expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.data.timestamp).toBeDefined();
  });
});

describe('GET /api/nonexistent', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request.get('/api/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Users/yangyu/Documents/AI-work/baby-kingdom-new/backend && npm test`

Expected: 2 tests PASS (requires local MongoDB and Redis running)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/modules/health/
git commit -m "test: add health check and 404 handler tests"
```

---

### Task 17: Verify Full Stack Locally

- [ ] **Step 1: Start MongoDB and Redis locally (if not already running)**

```bash
# If using Docker for local dev:
docker run -d --name bk-mongo -p 27017:27017 mongo:7.0.14
docker run -d --name bk-redis -p 6379:6379 redis:7.4.1-alpine
```

- [ ] **Step 2: Start backend in dev mode**

```bash
cd /Users/yangyu/Documents/AI-work/baby-kingdom-new/backend
cp ../.env.development .env
npm run dev
```

Expected: Logs show "MongoDB connected", "Redis connected", "Backend listening on port 3000"

- [ ] **Step 3: Test health endpoint**

```bash
curl http://localhost:3000/api/health | jq
```

Expected:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 5,
    "timestamp": "2026-04-06T...",
    "services": {
      "mongodb": "connected",
      "redis": "connected"
    }
  }
}
```

- [ ] **Step 4: Test 404**

```bash
curl http://localhost:3000/api/foo | jq
```

Expected:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /api/foo not found"
  }
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Final commit**

```bash
cd /Users/yangyu/Documents/AI-work/baby-kingdom-new
git add -A
git commit -m "feat: Plan 1 complete — foundation scaffold with Docker, Express, MongoDB, Redis, health check"
```

---

## Summary

Plan 1 delivers:
- Docker Compose with 5 containers, health checks, network isolation, named volumes
- Express backend with modular monolith structure
- MongoDB and Redis connection modules
- Unified response format and custom error classes
- Global error handler (AppError, Mongoose errors, duplicate keys)
- Health check endpoint (`GET /api/health`)
- pino structured logging
- Graceful shutdown for both backend and worker
- Jest test setup with integration test helpers
- Nginx proxy config for frontend (SPA + API + Socket.io)
- Environment configuration (.env.example, multi-environment)
