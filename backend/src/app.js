import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestLogger } from './shared/middleware/request-logger.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFound } from './shared/middleware/not-found.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';

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

// Error handling (must be after routes)
app.use(notFound);
app.use(errorHandler);

export default app;
