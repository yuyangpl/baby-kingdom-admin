# Changelog

## v1.0.0 — 2026-04-06 — Initial Build

### Phase 1: Backend Foundation (Plans 1-8)

**Plan 1: Foundation**
- Docker Compose with 5 containers (frontend/backend/worker/mongodb/redis)
- Health checks, network isolation (frontend-net/backend-net), named volumes
- Express app with modular monolith structure
- MongoDB + Redis connection modules
- pino structured logging, graceful shutdown
- Unified response format + 6 custom error classes
- Jest test setup (108 integration tests)

**Plan 2: Auth**
- JWT dual-token: Access Token (30min) + Refresh Token (7d HttpOnly cookie)
- User model with bcrypt, role enum (admin/editor/viewer)
- Login, register, refresh, logout, change password
- User CRUD (list, update role, delete) — admin only
- Auth middleware: authenticate + authorize
- Admin seed on startup

**Plan 3: Core Config**
- Config CRUD with AES-256 encryption for secrets, masking on read
- ToneMode CRUD (11 fields including prompt injection)
- Persona CRUD (15+ fields, password masking)
- TopicRule CRUD (keywords, sensitivity tier, sentiment trigger)
- AuditLog module with TTL auto-cleanup
- Shared buildCrud helper with automatic audit logging

**Plan 4: Forum**
- ForumCategory + ForumBoard models
- PersonaBindings embedded array (board-specific tone, weight, daily limit)
- Tree API (categories → boards → populated persona bindings)
- Forum sync from BK API

**Plan 5: Gemini AI**
- Gemini service with mock fallback
- 6-layer prompt builder (System + Persona + Tone + Topic + Rules + Google Trends + Task)
- Tone mode resolution priority chain (5 levels)
- Auto sensitivity tier assignment (keyword-based)
- Google Trends matching (self-hosted API)
- Quality guard (AI pattern detection, format checks, similarity detection)

**Plan 6: Scanner & Trends**
- ThreadScanner: 7-layer filtering + 2 circuit breakers
- Two-step Gemini calls (evaluate first, generate only for hits)
- Feed model (30+ fields, 6 indexes)
- TrendPuller with MediaLens API integration
- MediaLens OTP request/verify endpoints

**Plan 7: Feed & Poster**
- Feed CRUD with full lifecycle (pending → approved → posted/rejected/failed)
- Claim/Unclaim with 10-min expiry and conflict detection
- Batch approve/reject with partial failure handling
- Custom generate (manual topic → AI draft)
- Regenerate with tone/persona switch
- BK Forum poster: login, preflight, post thread/reply, 32s retry

**Plan 8: Queue & Dashboard**
- 6 BullMQ queues (scanner, trends, poster, daily-reset, stats-aggregator, ml-token-refresh)
- Queue management API (status, pause/resume, trigger, job history, retry)
- Dashboard API (realtime, today, recent, weekly)
- DailyStats model with comprehensive aggregation

### Phase 2: Integration & Full CRUD

**BK Forum API**
- Exact port of GAS BKForumPoster.js to Node.js
- Login with status=1 validation, in-memory + DB token caching
- Preflight check for new threads (typeid resolution)
- Rate limit retry (32s sleep, max 2 retries)
- fetchThreadList/fetchThreadContent shared with Scanner

**Config Seed**
- 46 preset config items across 6 categories
- Auto-seeded on first server startup

**Socket.io**
- Server with Redis adapter (cross-process events)
- JWT auth middleware for connections
- Room-based subscriptions (join/leave)
- Events: feed:new/statusChanged/claimed/unclaimed, queue:status/progress, scanner:result, trends:new

**Worker**
- 5 BullMQ processors with QueueJob recording
- Poster: concurrency 1, 35s limiter
- Cron scheduler with Redis leader election
- Jobs: scanner(30m), trends(1h), daily-reset(midnight), stats(1h)

**Swagger API Docs**
- swagger-jsdoc + swagger-ui-express at /api/docs

**Data Import**
- 5 Tone Modes, 30 Personas, 12 Topic Rules, 6 Categories + 34 Forum Boards
- Run once: `node src/seeds/import-data.js`

### Plan 9: Frontend

**Vue 3 + Element Plus + Pinia**
- 13 pages with route-level permission guards
- 6 CRUD form components (PersonaForm, ToneForm, TopicRuleForm, UserForm, FeedEditModal, CustomGenerateModal)
- 4 Pinia stores (auth, feed, queue, notification)
- Socket.io client with 8 event listeners
- Axios interceptor with JWT auto-refresh
- Vite dev proxy, Nginx production config, multi-stage Dockerfile

---

## Project Stats

| Metric | Count |
|--------|-------|
| Git commits | 15 |
| Backend modules | 14 |
| API endpoints | 65+ |
| Backend test suites | 14 |
| Integration tests | 108 |
| Frontend pages | 13 |
| Frontend components | 20+ |
| Pinia stores | 4 |
| CRUD form components | 6 |
| Socket.io events | 8 |
| BullMQ queues | 6 |
| MongoDB collections | 12 |
| Config presets | 46 |
| Seeded personas | 30 |
| Seeded tone modes | 5 |
| Seeded topic rules | 12 |
| Seeded forum boards | 34 |
| Lines of code | ~7,300 |

## Pending

- [ ] Connect real Gemini API (requires API key)
- [ ] Production deployment
- [ ] v1.1 backlog items (see design spec section 29)
