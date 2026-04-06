# Backend — CLAUDE.md

## Quick Start

```bash
cp ../.env.development .env
npm install
npm run dev       # API server (port 3000)
npm run worker    # Queue processors + cron
npm test          # 108 tests
```

## Module Map

| Module | Route Prefix | Key Files |
|--------|-------------|-----------|
| health | `/api/health` | controller, routes |
| auth | `/api/v1/auth` | model (User), service (JWT dual-token, seed), controller, routes |
| config | `/api/v1/configs` | model, service (AES encrypt/decrypt/mask), controller, routes |
| tone | `/api/v1/tones` | model (ToneMode), routes (uses buildCrud) |
| persona | `/api/v1/personas` | model (Persona, 15+ fields), routes (uses buildCrud) |
| topic-rules | `/api/v1/topic-rules` | model (TopicRule), routes (uses buildCrud) |
| forum | `/api/v1/forums` | model (ForumCategory + ForumBoard + PersonaBindings), service, controller, routes |
| gemini | (internal, no routes) | gemini.service (API call + mock), prompt.builder (6 blocks), google-trends.service, quality-guard |
| scanner | `/api/v1/scanner` | service (7-layer filter + 2 breakers), controller, routes |
| trends | `/api/v1/trends` | model (Trend), service (MediaLens pull + OTP), controller, routes |
| feed | `/api/v1/feeds` | model (Feed, 30+ fields), service (CRUD + claim + approve/reject + batch + regenerate + custom), controller, routes |
| poster | `/api/v1/poster` | service (BK login + preflight + post + retry + rate limit + forum sync + fetchThread), controller, routes |
| queue | `/api/v1/queues` | model (QueueJob), service (6 BullMQ queues), controller, routes |
| dashboard | `/api/v1/dashboard` | model (DailyStats), service (realtime + aggregation), controller, routes |
| audit | `/api/v1/audits` | model (AuditLog, TTL index), service (log + list), controller, routes |

## Adding a New Module

1. Create `src/modules/<name>/` with model, service, controller, routes
2. Register in `src/app.js`: `import xxxRoutes` + `app.use('/api/v1/xxx', xxxRoutes)`
3. For simple CRUD: use `buildCrud(Model, 'moduleName')` from `shared/crud.js`
4. Add tests in `tests/modules/<name>/<name>.test.js`
5. Use unique email in test setup to avoid parallel conflicts

## Shared Utilities

- `shared/database.js` — connectDB, disconnectDB, isDBConnected
- `shared/redis.js` — getRedis, connectRedis, disconnectRedis, isRedisConnected
- `shared/socket.js` — initSocketIO, getIO, emitToRoom, emitToAll
- `shared/logger.js` — pino logger (pretty in dev, JSON in prod)
- `shared/response.js` — success(res, data), paginated(res, data, pagination), created(res, data)
- `shared/errors.js` — AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, BusinessError
- `shared/crud.js` — buildCrud(Model, moduleName) → { list, getById, create, update, remove }
- `shared/swagger.js` — setupSwagger(app) → /api/docs
- `shared/middleware/auth.js` — authenticate, authorize(...roles)
- `shared/middleware/error-handler.js` — catches AppError, Mongoose errors, duplicate keys
- `shared/middleware/request-logger.js` — pino request logging
- `shared/middleware/not-found.js` — 404 handler

## Worker (src/worker.js)

5 BullMQ processors:
- `scanner` — calls scanForumThreads()
- `trends` — calls pullTrends()
- `poster` — calls postFeed(feedId), concurrency:1, 35s limiter
- `daily-reset` — resets Persona.postsToday
- `stats-aggregator` — calls aggregateDailyStats()

Cron via node-cron with Redis leader election (only 1 worker runs cron).

## Seeds

- `src/seeds/config.seeds.js` — 46 config presets, auto-seeded in server.js
- `src/seeds/import-data.js` — 30 Personas + 5 Tones + 12 Rules + 34 Boards, run manually once
