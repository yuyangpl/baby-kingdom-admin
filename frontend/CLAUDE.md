# Frontend — CLAUDE.md

## Quick Start

```bash
npm install
npm run dev       # Vite dev server (port 5173, proxies /api to :3000)
npm run build     # Production build → dist/
```

## Structure

```
src/
├── main.ts                 # Vue + Pinia + Router + Element Plus + icons
├── env.d.ts                # Vite client types + Vue SFC module declaration
├── App.vue                 # Root (router-view only)
├── api/index.ts            # Axios instance (JWT auto-refresh interceptor)
├── socket/
│   ├── index.ts            # Socket.io client (connect/disconnect/room management)
│   └── listeners.ts        # 8 event handlers → Pinia stores → ElNotification
├── stores/
│   ├── auth.ts             # login/logout/fetchMe, accessToken, role getters
│   ├── feed.ts             # feeds list, pagination, filters, newFeedCount, claim/status updates
│   ├── queue.ts            # queue statuses
│   ├── notification.ts     # toast notifications, unread count
│   └── app.ts              # sidebar collapsed, language
├── router/index.ts         # Routes + beforeEach role guard (admin>editor>viewer)
├── components/
│   └── AppLayout.vue       # Sidebar + header + notification badge + socket connect
└── views/                  # 13 pages (lazy-loaded)
    ├── login/LoginView.vue
    ├── dashboard/DashboardView.vue
    ├── feed/
    │   ├── FeedView.vue              # Tabs, table, claim, batch, filters
    │   ├── FeedEditModal.vue         # Edit content + approve
    │   └── CustomGenerateModal.vue   # Topic → AI generate
    ├── scanner/ScannerView.vue
    ├── trends/TrendsView.vue
    ├── poster/PosterView.vue
    ├── persona/
    │   ├── PersonaView.vue           # Card grid
    │   └── PersonaForm.vue           # el-drawer (14 fields)
    ├── tone/
    │   ├── ToneView.vue              # Table
    │   └── ToneForm.vue              # el-dialog (11 fields)
    ├── topic-rules/
    │   ├── TopicRulesView.vue        # Table + keyword chips
    │   └── TopicRuleForm.vue         # el-dialog (10 fields)
    ├── forum/ForumView.vue           # Tree + board config
    ├── config/ConfigView.vue         # Category tabs + inline edit
    ├── queue/QueueView.vue           # Status cards + pause/resume
    ├── audit/AuditView.vue           # Log table + filters
    └── user/
        ├── UserView.vue              # Table + inline role change
        └── UserForm.vue              # el-dialog (create user)
```

## Adding a New Page

1. Create `src/views/<name>/<Name>View.vue`
2. Add route in `src/router/index.ts` under the layout children
3. Add menu item in `src/components/AppLayout.vue`
4. If CRUD: create `<Name>Form.vue` with `modelValue` + `editData` props, emit `saved`

## CRUD Form Pattern

```vue
<!-- Parent (list page) -->
<XxxForm v-model="showForm" :edit-data="editData" @saved="loadData" />

<!-- Form component props -->
props: {
  modelValue: Boolean,     // dialog/drawer visibility
  editData: Object|null,   // null=create, object=edit
}
emits: ['update:modelValue', 'saved']
```

## API Integration

```javascript
import api from '../../api';

// GET with pagination
const res = await api.get('/v1/feeds', { params: { status: 'pending', page: 1 } });
// res.data = [...], res.pagination = { page, limit, total, pages }

// POST/PUT/DELETE
await api.post('/v1/feeds/custom-generate', { topic: '...' });
await api.put(`/v1/feeds/${id}/content`, { content: '...' });
await api.delete(`/v1/personas/${id}`);
```

Response is auto-unwrapped by interceptor (returns `res.data` from Axios).

## Permission

- Route `meta.role`: `'admin'` | `'editor'` — minimum role required
- `useAuthStore()`: `isAdmin`, `isEditor`, `role` getters
- Template: `v-if="auth.isAdmin"` to show/hide admin-only elements

## Socket Events

| Event | Store Action | UI Effect |
|-------|-------------|-----------|
| `feed:new` | feedStore.incrementNewCount | "N new feeds" banner + toast |
| `feed:statusChanged` | feedStore.updateFeedStatus | Row status update + toast |
| `feed:claimed` | feedStore.updateFeedClaim | Lock icon on row |
| `feed:unclaimed` | feedStore.updateFeedClaim(null) | Unlock row |
| `queue:status` | queueStore.updateQueueStatus | Card refresh |
| `queue:progress` | — | Toast notification |
| `scanner:result` | — | Toast with scan stats |
| `trends:new` | — | Toast with trend count |
