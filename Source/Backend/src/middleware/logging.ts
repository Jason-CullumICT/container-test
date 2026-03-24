// Verifies: FR-004
// Request logging middleware: logs method, path, duration, status

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path: reqPath, url } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const logData: Record<string, unknown> = {
      method,
      path: reqPath,
      url,
      status: statusCode,
      duration_ms: duration,
    };

    if (statusCode >= 500) {
      logger.error('Request completed', logData);
    } else if (statusCode >= 400) {
      logger.warn('Request completed', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}
