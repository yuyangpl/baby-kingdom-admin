# Phase 2: Integration & Full CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all missing backend integrations (Socket.io, Worker, Config seeding) and upgrade frontend from list-only stubs to full CRUD with real-time updates.

**Architecture:** Backend adds Socket.io server + Worker queue processors + cron scheduling. Frontend adds CRUD modals + Pinia stores + Socket event listeners for real-time UI.

**Tech Stack:** socket.io + @socket.io/redis-adapter, node-cron, swagger-jsdoc + swagger-ui-express

---

## Plan Overview (11 Tasks)

| Task | Scope | Priority |
|------|-------|----------|
| 1 | Config preset seeding (40+ items) | Critical |
| 2 | Socket.io server + Redis adapter | Critical |
| 3 | Worker queue processors + cron jobs | Critical |
| 4 | Socket.io event emission from services | Critical |
| 5 | Frontend Pinia stores (feed, queue, notification) | Important |
| 6 | Frontend Socket.io event listeners | Important |
| 7 | Frontend CRUD modals — Persona | Important |
| 8 | Frontend CRUD modals — Tone Modes | Important |
| 9 | Frontend CRUD modals — Topic Rules, Forum, Config, Users | Important |
| 10 | Feed page full workflow (claim, edit, approve, reject, post) | Important |
| 11 | Swagger API documentation | Normal |

---

## Task 1: Config Preset Seeding

**Files:**
- Create: `backend/src/seeds/config.seeds.js`
- Modify: `backend/src/server.js` — call seed on startup

Seed all 40+ config items from design spec section 8.10 with correct categories and isSecret flags. Call `configService.seed()` in server.js after DB connects.

---

## Task 2: Socket.io Server + Redis Adapter

**Files:**
- Modify: `backend/src/server.js` — create HTTP server, attach Socket.io
- Create: `backend/src/shared/socket.js` — Socket.io instance + Redis adapter + auth middleware
- Modify: `backend/package.json` — add `socket.io`, `@socket.io/redis-adapter`

Socket.io authenticates via JWT from handshake auth. Redis adapter enables Worker → Backend → Frontend event propagation.

---

## Task 3: Worker Queue Processors + Cron Jobs

**Files:**
- Modify: `backend/src/worker.js` — register BullMQ processors + cron scheduler
- Create: `backend/src/worker/processors.js` — job handler for each queue
- Create: `backend/src/worker/scheduler.js` — node-cron definitions
- Modify: `backend/package.json` — add `node-cron`

Queues: scanner (30min), trends (1hr), poster (event-driven), daily-reset (midnight), stats-aggregator (1hr), ml-token-refresh (12hr).

Each processor: record QueueJob start → execute service function → record completion/failure → emit Socket event via Redis pub/sub.

---

## Task 4: Socket.io Event Emission from Services

**Files:**
- Modify: `backend/src/modules/feed/feed.service.js` — emit feed:new, feed:statusChanged, feed:claimed, feed:unclaimed
- Modify: `backend/src/modules/scanner/scanner.service.js` — emit scanner:result
- Modify: `backend/src/modules/trends/trends.service.js` — emit trends:new
- Modify: `backend/src/modules/queue/queue.service.js` — emit queue:status, queue:progress

Import shared socket emitter, emit events after state changes. Worker uses Redis pub/sub to trigger events through Backend's Socket.io.

---

## Task 5: Frontend Pinia Stores

**Files:**
- Create: `frontend/src/stores/feed.js` — feeds list, pagination, filters, pending count
- Create: `frontend/src/stores/queue.js` — queue statuses, real-time updates
- Create: `frontend/src/stores/notification.js` — toast notifications from socket events
- Create: `frontend/src/stores/app.js` — sidebar collapsed, language, global UI state

---

## Task 6: Frontend Socket.io Event Listeners

**Files:**
- Create: `frontend/src/socket/listeners.js` — register all event handlers
- Modify: `frontend/src/components/AppLayout.vue` — connect socket on mount, disconnect on unmount
- Modify: `frontend/src/stores/notification.js` — receive events → ElNotification toasts

Events: feed:new → "N new feeds" banner, feed:claimed → lock icon update, queue:status → card refresh, scanner:result → toast notification.

---

## Task 7: Frontend CRUD — Persona

**Files:**
- Modify: `frontend/src/views/persona/PersonaView.vue` — add create/edit drawer + delete confirm
- Create: `frontend/src/views/persona/PersonaForm.vue` — el-drawer with full persona form (all 15+ fields)

Form fields: accountId, username, archetype (select), primaryToneMode (select), voiceCues (tag input), catchphrases (tag input), topicBlacklist (tag input), tier3Script (textarea), maxPostsPerDay (number), bkPassword (password), overrideNotes (textarea).

---

## Task 8: Frontend CRUD — Tone Modes

**Files:**
- Modify: `frontend/src/views/tone/ToneView.vue` — add create/edit dialog + delete
- Create: `frontend/src/views/tone/ToneForm.vue` — el-dialog with all tone fields

Form: toneId, displayName, whenToUse, emotionalRegister, openingStyle (textarea, "Injected into prompt" note), sentenceStructure (textarea), whatToAvoid (textarea), exampleOpening, suitableForTier3 (switch), overridePriority (number).

---

## Task 9: Frontend CRUD — Topic Rules, Forum, Config, Users

**Files:**
- Modify + create form components for:
  - `topic-rules/TopicRulesView.vue` + `TopicRuleForm.vue`
  - `forum/ForumView.vue` — board edit panel + persona bindings table
  - `config/ConfigView.vue` — inline edit per config row, save button
  - `user/UserView.vue` + `UserForm.vue` — register dialog, role dropdown

---

## Task 10: Feed Page Full Workflow

**Files:**
- Modify: `frontend/src/views/feed/FeedView.vue` — tabs (pending/approved/posted/rejected), claim button with timer, batch actions
- Create: `frontend/src/views/feed/FeedEditModal.vue` — edit content + persona/tone selector + regenerate
- Create: `frontend/src/views/feed/FeedCard.vue` — card component with sensitivity border, claim status, action buttons
- Create: `frontend/src/views/feed/CustomGenerateModal.vue` — topic input + persona/tone select

---

## Task 11: Swagger API Documentation

**Files:**
- Modify: `backend/package.json` — add `swagger-jsdoc`, `swagger-ui-express`
- Create: `backend/src/shared/swagger.js` — swagger config + JSDoc definition
- Modify: `backend/src/app.js` — mount `/api/docs`
- Modify: each routes file — add JSDoc `@swagger` annotations

---

## Execution Order

```
Task 1 (Config Seed) → Task 2 (Socket Server) → Task 3 (Worker)
     ↓                       ↓
Task 4 (Socket Emit)    Task 5 (Pinia Stores)
     ↓                       ↓
Task 6 (Socket Listeners)
     ↓
Tasks 7-10 (Frontend CRUD) — can run in parallel
     ↓
Task 11 (Swagger) — independent
```
