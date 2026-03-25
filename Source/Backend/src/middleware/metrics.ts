// Verifies: FR-004
// Prometheus metrics middleware: exposes GET /metrics with route latency histogram

import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Initialize the default registry with default metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// HTTP request duration histogram
export const httpRequestDurationHistogram = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

// HTTP request counter
export const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Feature request state transitions counter
export const featureRequestTransitionsCounter = new client.Counter({
  name: 'feature_request_status_transitions_total',
  help: 'Total number of feature request status transitions',
  labelNames: ['from_status', 'to_status'],
  registers: [register],
});

// AI voting invocations counter
export const aiVotingCounter = new client.Counter({
  name: 'ai_voting_invocations_total',
  help: 'Total number of AI voting rounds triggered',
  registers: [register],
});

// Pipeline stage completions counter (FR-043)
export const pipelineStageCompletionsCounter = new client.Counter({
  name: 'pipeline_stage_completions_total',
  help: 'Total number of pipeline stage completions',
  labelNames: ['stage_name', 'verdict'],
  registers: [register],
});

// Cycle feedback counter (FR-061)
export const cycleFeedbackCounter = new client.Counter({
  name: 'cycle_feedback_total',
  help: 'Total number of cycle feedback entries created',
  labelNames: ['feedback_type'],
  registers: [register],
});

// Image uploads counter (FR-079)
export const imageUploadsCounter = new client.Counter({
  name: 'image_uploads_total',
  help: 'Total number of image uploads',
  labelNames: ['entity_type'],
  registers: [register],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestDurationHistogram.observe(labels, duration);
    httpRequestCounter.inc(labels);
  });

  next();
}

export async function metricsHandler(req: Request, res: Response): Promise<void> {
  res.set('Content-Type', register.contentType);
  const metrics = await register.metrics();
  res.end(metrics);
}

export { register };
