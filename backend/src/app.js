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
