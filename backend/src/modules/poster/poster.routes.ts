import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './poster.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/history', authenticate, wrap(ctrl.history));
router.post('/:id/post', authenticate, authorize('admin', 'editor'), wrap(ctrl.postFeed));

export default router;
