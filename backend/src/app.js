import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestLogger } from './shared/middleware/request-logger.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFound } from './shared/middleware/not-found.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import configRoutes from './modules/config/config.routes.js';
import toneRoutes from './modules/tone/tone.routes.js';
import personaRoutes from './modules/persona/persona.routes.js';
import topicRulesRoutes from './modules/topic-rules/topic-rules.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Parsing
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Logging
app.use(requestLogger);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/configs', configRoutes);
app.use('/api/v1/tones', toneRoutes);
app.use('/api/v1/personas', personaRoutes);
app.use('/api/v1/topic-rules', topicRulesRoutes);
app.use('/api/v1/audits', auditRoutes);

// Error handling (must be after routes)
app.use(notFound);
app.use(errorHandler);

export default app;
