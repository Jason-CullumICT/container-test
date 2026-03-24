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

// Orchestrator proxy — forwards requests to the claude-ai-OS orchestrator
// Allows the feature portal to submit work and monitor cycles
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:9800';

app.use('/api/orchestrator', async (req, res) => {
  const targetUrl = `${ORCHESTRATOR_URL}${req.url}`;
  try {
    const fetchOpts: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOpts.body = JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, fetchOpts);
    const contentType = response.headers.get('content-type') || '';

    // SSE passthrough for streaming logs
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = response.body?.getReader();
      if (reader) {
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch(() => res.end());
        req.on('close', () => reader.cancel());
      }
      return;
    }

    const data = await response.text();
    res.status(response.status).type(contentType).send(data);
  } catch (err) {
    logger.error('Orchestrator proxy error', { url: targetUrl, error: (err as Error).message });
    res.status(502).json({ error: `Orchestrator unreachable at ${ORCHESTRATOR_URL}` });
  }
});

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
