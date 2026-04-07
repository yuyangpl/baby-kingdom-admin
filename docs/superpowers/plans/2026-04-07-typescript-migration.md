# TypeScript 迁移计划

## 概览

将 BK Admin 前后端从 JavaScript 全面迁移到 TypeScript。

| 区域 | 文件数 | 代码行 |
|------|--------|--------|
| 后端 src | 71 | ~4,600 |
| 前端 src | 32 | ~3,100 |
| 后端测试 | 29 | ~3,700 |
| 前端测试 | 7 | ~400 |
| **合计** | **139** | **~11,800** |

## 迁移策略

**渐进式迁移**：`allowJs: true` + 逐文件 rename `.js → .ts`，每个 Phase 结束后全量测试必须通过。

**不做的事：**
- 不重写业务逻辑
- 不改变目录结构
- Vue SFC 保持 `.vue` 后缀，只改 `<script>` → `<script setup lang="ts">`

---

## Phase 1：后端 TS 基础设施（~15 文件）

**目标：** 配置 TypeScript 编译环境，迁移 shared 工具层（最无依赖的底层模块）。

| 步骤 | 内容 |
|------|------|
| 1.1 | 安装 `typescript`, `tsx`, `@types/node`, `@types/express`, `@types/jsonwebtoken`, `@types/nodemailer`, `@types/cookie-parser`, `@types/cors` 等类型包 |
| 1.2 | 创建 `backend/tsconfig.json`（target: ES2022, module: NodeNext, allowJs: true, strict: true, outDir: dist） |
| 1.3 | 修改 `package.json` scripts：`dev` 用 `tsx watch`，`build` 用 `tsc`，`start` 用 `node dist/server.js` |
| 1.4 | 迁移 `shared/` 目录（15 文件）：errors.ts, response.ts, logger.ts, database.ts, redis.ts, socket.ts, encryption.ts, email.ts, health-monitor.ts, crud.ts, swagger.ts, middleware/*.ts |
| 1.5 | 创建 `backend/src/types/` 目录，定义通用类型：`express.d.ts`（扩展 Request 加 user 字段）、`environment.d.ts` |
| 1.6 | 迁移 app.ts, server.ts, worker.ts |
| 1.7 | 运行全量测试确认通过 |

**关键类型定义：**
```typescript
// types/express.d.ts
declare namespace Express {
  interface Request {
    user?: { id: string; role: 'admin' | 'editor' | 'viewer' };
  }
}

// types/environment.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT?: string;
    MONGO_URI: string;
    REDIS_HOST?: string;
    JWT_SECRET: string;
    ENCRYPTION_KEY: string;
    SMTP_HOST?: string;
    // ...
  }
}
```

---

## Phase 2：后端 Models + Services（~30 文件）

**目标：** 迁移所有 Mongoose 模型和业务服务，添加完整类型。

| 步骤 | 内容 |
|------|------|
| 2.1 | 安装 Mongoose TS 类型（Mongoose 8 已内置类型，无需额外安装） |
| 2.2 | 迁移 14 个 model 文件：为每个 Schema 定义 `interface IXxx` + `type XxxDocument`，使用 `Schema<IXxx>` 泛型 |
| 2.3 | 迁移 seeds/（config.seeds.ts, import-data.ts） |
| 2.4 | 迁移 14 个 service 文件：函数参数/返回值类型标注 |
| 2.5 | 运行全量测试 |

**Model 类型模式：**
```typescript
interface IFeed {
  feedId: string;
  type: 'thread' | 'reply';
  status: 'pending' | 'approved' | 'rejected' | 'posted' | 'failed';
  // ...
}

type FeedDocument = HydratedDocument<IFeed>;

const feedSchema = new Schema<IFeed>({ ... });
export default mongoose.model<IFeed>('Feed', feedSchema);
```

---

## Phase 3：后端 Controllers + Routes（~28 文件）

**目标：** 迁移所有 controller 和 route 文件，Express 请求/响应完整类型化。

| 步骤 | 内容 |
|------|------|
| 3.1 | 迁移 14 个 controller 文件：`Request`, `Response`, `NextFunction` 类型标注 |
| 3.2 | 迁移 14 个 routes 文件：Router 类型 |
| 3.3 | 确认 `allowJs: false`，移除所有 .js 源文件（测试暂保留 .js） |
| 3.4 | 运行全量测试 |

---

## Phase 4：后端测试迁移（~29 文件）

**目标：** 测试文件改为 TS，配置 ts-jest。

| 步骤 | 内容 |
|------|------|
| 4.1 | 安装 `ts-jest`, `@types/jest`, `@types/supertest` |
| 4.2 | 更新 `jest.config.ts`：使用 ts-jest ESM preset |
| 4.3 | 迁移 `tests/helpers.ts`, `tests/setup.ts` |
| 4.4 | 逐个迁移 29 个测试文件 `.js → .ts` |
| 4.5 | 运行全量测试，确保 211 个测试全部通过 |

---

## Phase 5：前端 TS 基础设施（~7 文件）

**目标：** 配置 Vue 3 + Vite + TypeScript 环境，迁移非 Vue 文件。

| 步骤 | 内容 |
|------|------|
| 5.1 | 创建 `frontend/tsconfig.json`（已有 Vite 的 tsconfig 模板支持） |
| 5.2 | 创建 `frontend/src/env.d.ts`（Vite 环境类型 + Vue SFC 声明） |
| 5.3 | 迁移 `src/api/index.ts`：Axios 实例 + 拦截器类型 |
| 5.4 | 迁移 `src/stores/*.ts`（5 个 Pinia store）：defineStore 泛型 |
| 5.5 | 迁移 `src/router/index.ts`：RouteRecordRaw 类型 |
| 5.6 | 迁移 `src/socket/*.ts`（2 个文件） |
| 5.7 | 迁移 `src/main.ts` |
| 5.8 | 运行前端测试确认通过 |

---

## Phase 6：前端 Vue SFC 迁移（~20 文件）

**目标：** 所有 `.vue` 文件的 `<script>` 改为 `<script setup lang="ts">`。

| 步骤 | 内容 |
|------|------|
| 6.1 | 迁移 `App.vue`, `AppLayout.vue` |
| 6.2 | 迁移 `LoginView.vue`, `DashboardView.vue` |
| 6.3 | 迁移 Feed 相关 3 个 Vue（FeedView, FeedEditModal, CustomGenerateModal） |
| 6.4 | 迁移 CRUD 表单组件 6 个（Persona, Tone, TopicRule 各 View + Form） |
| 6.5 | 迁移剩余 View 页面 9 个（Scanner, Trends, Poster, Forum, Config, Queue, Audit, User View + Form） |
| 6.6 | 定义 `src/types/` 目录：API 响应类型、Feed/Persona/Config 等业务类型（可与后端共享接口定义） |
| 6.7 | 运行 `vue-tsc --noEmit` 确认零类型错误 |
| 6.8 | 运行前端测试 |

---

## Phase 7：前端测试迁移（~7 文件）

**目标：** 前端测试文件改为 TS。

| 步骤 | 内容 |
|------|------|
| 7.1 | Vitest 已原生支持 TS，无需额外配置 |
| 7.2 | 迁移 `tests/setup.ts` |
| 7.3 | 迁移 store 测试 4 个 + router 测试 1 个 + smoke 测试 1 个 |
| 7.4 | 运行前端测试确认 28 个测试全部通过 |

---

## Phase 8：收尾 + CI 优化

| 步骤 | 内容 |
|------|------|
| 8.1 | 后端 `tsconfig.json` 设置 `allowJs: false`，确认零 JS 残留 |
| 8.2 | 更新 Dockerfile：添加 `npm run build` 构建步骤 |
| 8.3 | 更新 docker-compose.yml：backend/worker 使用编译后的 `dist/` |
| 8.4 | 更新 `jest.config.ts` 和 `vitest.config.ts` 指向 .ts 文件 |
| 8.5 | 更新 CLAUDE.md 和 README.md 反映 TS 技术栈 |
| 8.6 | 全量测试：后端 211 + 前端 28 全部通过 |
| 8.7 | `vue-tsc --noEmit` + `tsc --noEmit` 零错误 |

---

## 执行顺序与依赖

```
Phase 1 (后端基础设施)
  ↓
Phase 2 (Models + Services)
  ↓
Phase 3 (Controllers + Routes)
  ↓
Phase 4 (后端测试)          Phase 5 (前端基础设施)
                              ↓
                            Phase 6 (Vue SFC)
                              ↓
                            Phase 7 (前端测试)
  ↓                           ↓
Phase 8 (收尾)  ←←←←←←←←←←←←←
```

## 预估工作量

| Phase | 文件数 | 估算 |
|-------|--------|------|
| 1. 后端基础设施 | ~18 | 中 |
| 2. Models + Services | ~30 | 大 |
| 3. Controllers + Routes | ~28 | 中 |
| 4. 后端测试 | ~29 | 中 |
| 5. 前端基础设施 | ~10 | 小 |
| 6. Vue SFC | ~20 | 中 |
| 7. 前端测试 | ~7 | 小 |
| 8. 收尾 | ~5 | 小 |

## 风险与注意事项

1. **Mongoose + TS**：Schema 定义和 Interface 需要双重维护，用 `Schema<IXxx>` 泛型减少不一致
2. **ESM + TS**：Node.js ESM 模式下需要 `moduleResolution: NodeNext`，import 路径需要 `.js` 后缀（TS 编译后的路径）
3. **Jest ESM + TS**：目前用 `--experimental-vm-modules`，迁移到 ts-jest 的 ESM preset 可能有兼容问题，备选方案是用 `@swc/jest`
4. **测试 mock**：`jest.unstable_mockModule` 在 TS 中类型推导可能需要额外处理
5. **Vue SFC**：`defineProps<T>()` 和 `defineEmits<T>()` 需要明确泛型类型
