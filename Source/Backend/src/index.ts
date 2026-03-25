// Verifies: FR-002, FR-004, FR-021
// Express app entry point with all middleware and routes.

import express from 'express';
import cors from 'cors';
import path from 'path';
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

// Static file serving for uploaded images (FR-077, DD-IMG-03)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
// Verifies: FR-078
// Orchestrator proxy — supports both JSON and multipart form-data (DD-IMG-06)
app.use('/api/orchestrator', async (req, res) => {
  const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:9800';
  const targetUrl = `${orchestratorUrl}${req.url}`;
  try {
    const incomingContentType = req.headers['content-type'] || '';
    const isMultipart = incomingContentType.includes('multipart/form-data');

    let fetchOpts: RequestInit;

    if (req.method === 'GET' || req.method === 'HEAD') {
      fetchOpts = { method: req.method };
    } else if (isMultipart) {
      // FR-078: Stream multipart requests to the orchestrator
      // Pipe the raw request body with its original content-type (preserving boundary)
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const body = Buffer.concat(chunks);

      fetchOpts = {
        method: req.method,
        headers: { 'Content-Type': incomingContentType },
        body,
      };
      logger.info('Orchestrator proxy forwarding multipart request', {
        url: targetUrl,
        contentLength: body.length,
      });
    } else {
      fetchOpts = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      };
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
    const orchUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:9800';
    res.status(502).json({ error: `Orchestrator unreachable at ${orchUrl}` });
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
