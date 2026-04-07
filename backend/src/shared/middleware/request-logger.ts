import { Request, Response } from 'express';
import logger from '../logger.js';

export function requestLogger(req: Request, res: Response, done: () => void): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  done();
}
