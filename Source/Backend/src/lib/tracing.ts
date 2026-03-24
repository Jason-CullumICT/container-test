// Verifies: FR-021
// OpenTelemetry tracing stubs: instrument HTTP routes and database calls
// Propagates W3C traceparent header across service boundaries

import * as api from '@opentelemetry/api';

export const tracer = api.trace.getTracer('dev-workflow-platform', '1.0.0');

/**
 * Initialize OpenTelemetry SDK.
 * In production, this would configure OTLP exporters.
 * In development/test, it runs as a no-op stub.
 */
export function initTracing(): void {
  // The NodeSDK is only initialized if OTEL_EXPORTER_OTLP_ENDPOINT is set.
  // Otherwise we rely on the no-op tracer provided by @opentelemetry/api.
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // No-op: tracing is available but exports nowhere
    return;
  }

  // Dynamic import to avoid pulling in the full SDK when not needed
  Promise.resolve().then(async () => {
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

      const sdk = new NodeSDK({
        traceExporter: new OTLPTraceExporter({ url: endpoint }),
        instrumentations: [getNodeAutoInstrumentations()],
      });

      sdk.start();
    } catch (err) {
      // Tracing initialization failure is non-fatal
    }
  });
}

/**
 * Create a span for a named operation.
 * Usage:
 *   withSpan('featureRequests.create', async (span) => {
 *     // ... do work ...
 *     span.setAttribute('fr.id', frId);
 *   });
 */
export async function withSpan<T>(
  name: string,
  fn: (span: api.Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: api.SpanStatusCode.OK });
      return result;
    } catch (err) {
      const error = err as Error;
      span.setStatus({
        code: api.SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Extract W3C traceparent from incoming request headers.
 * Used for distributed tracing propagation.
 */
export function extractTraceContext(headers: Record<string, string | string[] | undefined>): api.Context {
  const propagator = api.propagation;
  return propagator.extract(api.context.active(), headers, {
    get(carrier, key) {
      const val = carrier[key];
      if (Array.isArray(val)) return val[0];
      return val;
    },
    keys(carrier) {
      return Object.keys(carrier);
    },
  });
}

/**
 * Inject W3C traceparent into outbound request headers.
 */
export function injectTraceContext(headers: Record<string, string>): void {
  api.propagation.inject(api.context.active(), headers, {
    set(carrier, key, value) {
      carrier[key] = value;
    },
  });
}
