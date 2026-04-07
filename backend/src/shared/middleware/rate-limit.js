import rateLimit from 'express-rate-limit';

// Skip rate limiting in test environment to avoid interfering with existing tests
const isTest = process.env.NODE_ENV === 'test';

/**
 * Create a rate limiter middleware.
 * In NODE_ENV=test returns a no-op pass-through unless `forceEnable` is true.
 *
 * @param {{ windowMs: number, max: number, message?: string }} options
 * @param {boolean} [forceEnable=false] - bypass test-skip (used by rate-limit tests themselves)
 */
export function createRateLimit(options, forceEnable = false) {
  if (isTest && !forceEnable) {
    return (_req, _res, next) => next();
  }
  return rateLimit({
    standardHeaders: true,  // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,   // Disable `X-RateLimit-*` headers
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'Too many requests, please try again later.',
        },
      });
    },
    ...options,
  });
}

// Pre-built limiters (disabled in test mode)
export const loginLimiter    = createRateLimit({ windowMs: 60 * 1000,      max: 5  });
export const refreshLimiter  = createRateLimit({ windowMs: 60 * 1000,      max: 10 });
export const generateLimiter = createRateLimit({ windowMs: 60 * 1000,      max: 10 });
export const scannerLimiter  = createRateLimit({ windowMs: 5 * 60 * 1000,  max: 3  });
export const globalLimiter   = createRateLimit({ windowMs: 60 * 1000,      max: 100 });
