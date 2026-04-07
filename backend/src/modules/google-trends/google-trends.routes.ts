import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './google-trends.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/', authenticate, wrap(ctrl.list));
router.post('/trigger', authenticate, authorize('admin'), wrap(ctrl.trigger));

export default router;
