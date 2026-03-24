// Verifies: FR-002, FR-004, FR-021
// Express app entry point with all middleware and routes.

import express from 'express';
import cors from 'cors';
import { initTracing } from './lib/tracing';
import { requestLoggingMiddleware } from './middleware/logging';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { errorHandler } from './middleware/errorHandler';
import { getDb } from './database/connection';
import { runMigrations } from './database/schema';
import featureRequestsRouter from './routes/featureRequests';
import bugsRouter from './routes/bugs';
import cyclesRouter from './routes/cycles';
import dashboardRouter from './routes/dashboard';
import learningsRouter from './routes/learnings';
import featuresRouter from './routes/features';
import pipelineRunsRouter, { getCyclePipelineHandler } from './routes/pipelines';
import logger from './lib/logger';

// Initialize OpenTelemetry tracing (FR-021)
initTracing();

const app = express();

// CORS middleware — restricted to configured origins (DD-7)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'traceparent', 'tracestate'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true }));

// Observability middleware (FR-004)
app.use(requestLoggingMiddleware);
app.use(metricsMiddleware);

// Prometheus metrics endpoint (FR-004)
app.get('/metrics', metricsHandler);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/feature-requests', featureRequestsRouter);
app.use('/api/bugs', bugsRouter);
app.use('/api/cycles', cyclesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/learnings', learningsRouter);
app.use('/api/features', featuresRouter);
app.use('/api/pipeline-runs', pipelineRunsRouter);

// Centralized error handler (must be last middleware) (FR-004)
app.use(errorHandler);

// Start server (only when not in test environment)
const PORT = parseInt(process.env.PORT || '3001', 10);

export function createApp() {
  return app;
}

export function startServer() {
  // Run database migrations
  const db = getDb();
  runMigrations(db);

  const server = app.listen(PORT, () => {
    logger.info('Backend server started', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      allowed_origins: allowedOrigins,
    });
  });

  return server;
}

// Only start if this is the main module
if (require.main === module) {
  startServer();
}

export default app;
