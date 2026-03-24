// Verifies: FR-004
// Centralized error handler returning {error: "message"}

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  if (err instanceof AppError) {
    logger.warn('Application error', {
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({ error: 'Internal server error' });
}
