import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { scannerLimiter } from '../../shared/middleware/rate-limit.js';
import * as ctrl from './scanner.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/history', authenticate, wrap(ctrl.history));
router.post('/trigger', scannerLimiter, authenticate, authorize('admin'), wrap(ctrl.trigger));

export default router;
