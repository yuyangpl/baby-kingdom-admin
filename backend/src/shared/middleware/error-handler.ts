import { Request, Response, NextFunction } from 'express';
import logger from '../logger.js';
import { AppError } from '../errors.js';

interface MongooseValidationError extends Error {
  errors: Record<string, { message: string }>;
}

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): Response {
  if (err instanceof AppError) {
    const body: { success: boolean; error: { code: string; message: string; fields?: unknown } } = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    if (err.fields) body.error.fields = err.fields;
    return res.status(err.statusCode).json(body);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError' && (err as MongooseValidationError).errors) {
    const fields = Object.entries((err as MongooseValidationError).errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields },
    });
  }

  // Mongoose duplicate key
  if ((err as MongoDuplicateKeyError).code === 11000) {
    const field = Object.keys((err as MongoDuplicateKeyError).keyValue || {})[0] || 'unknown';
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_KEY', message: `Duplicate value for ${field}` },
    });
  }

  logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}
