import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestLogger } from './shared/middleware/request-logger.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFound } from './shared/middleware/not-found.js';
import { globalLimiter } from './shared/middleware/rate-limit.js';
import { setupSwagger } from './shared/swagger.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import configRoutes from './modules/config/config.routes.js';
import toneRoutes from './modules/tone/tone.routes.js';
import personaRoutes from './modules/persona/persona.routes.js';
import topicRulesRoutes from './modules/topic-rules/topic-rules.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import forumRoutes from './modules/forum/forum.routes.js';
import scannerRoutes from './modules/scanner/scanner.routes.js';
import trendsRoutes from './modules/trends/trends.routes.js';
import feedRoutes from './modules/feed/feed.routes.js';
import posterRoutes from './modules/poster/poster.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import googleTrendsRoutes from './modules/google-trends/google-trends.routes.js';
import tasksRoutes from './modules/tasks/tasks.routes.js';
import taskLogRoutes from './modules/task-log/task-log.routes.js';

const app: Express = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Parsing
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// SQL injection defense handled by Prisma parameterized queries

// Logging
app.use(requestLogger);

// Global rate limit (100 req/min per IP)
app.use('/api/', globalLimiter);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/configs', configRoutes);
app.use('/api/v1/tones', toneRoutes);
app.use('/api/v1/personas', personaRoutes);
app.use('/api/v1/topic-rules', topicRulesRoutes);
app.use('/api/v1/audits', auditRoutes);
app.use('/api/v1/forums', forumRoutes);
app.use('/api/v1/scanner', scannerRoutes);
app.use('/api/v1/trends', trendsRoutes);
app.use('/api/v1/feeds', feedRoutes);
app.use('/api/v1/poster', posterRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/google-trends', googleTrendsRoutes);

app.use('/api/v1/task-logs', taskLogRoutes);

// Task endpoints (called by Cloud Scheduler, no auth required)
app.use('/tasks', tasksRoutes);

// Swagger API docs
setupSwagger(app);

// Error handling (must be after routes)
app.use(notFound);
app.use(errorHandler);

export default app;
