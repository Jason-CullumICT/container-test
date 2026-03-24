// Verifies: FR-003
// Logger abstraction: structured JSON in production, pretty-printing in development
// Uses OpenTelemetry context to inject trace/span IDs where available

import * as api from '@opentelemetry/api';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  if (env in LEVELS) return env;
  return 'info';
}

function getTraceContext(): { trace_id?: string; span_id?: string } {
  const span = api.trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  if (!api.isSpanContextValid(ctx)) return {};
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
  };
}

function formatPretty(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const upper = level.toUpperCase().padEnd(5);
  let line = `${ts} [${upper}] ${message}`;
  if (data && Object.keys(data).length > 0) {
    line += ' ' + JSON.stringify(data, null, 0);
  }
  return line;
}

function formatJson(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const traceCtx = getTraceContext();
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...traceCtx,
    ...(data || {}),
  });
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const configuredLevel = getConfiguredLevel();
  if (LEVELS[level] < LEVELS[configuredLevel]) return;

  const isProduction = process.env.NODE_ENV === 'production';
  const formatted = isProduction
    ? formatJson(level, message, data)
    : formatPretty(level, message, data);

  if (level === 'error') {
    process.stderr.write(formatted + '\n');
  } else {
    process.stdout.write(formatted + '\n');
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
};

export default logger;
