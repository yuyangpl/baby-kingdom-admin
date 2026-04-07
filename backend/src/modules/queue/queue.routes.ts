import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './queue.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/', authenticate, wrap(ctrl.getAll));
router.get('/jobs', authenticate, wrap(ctrl.allJobs));
router.get('/:name', authenticate, wrap(ctrl.getOne));
router.post('/:name/pause', authenticate, authorize('admin'), wrap(ctrl.pause));
router.post('/:name/resume', authenticate, authorize('admin'), wrap(ctrl.resume));
router.post('/:name/trigger', authenticate, authorize('admin'), wrap(ctrl.trigger));
router.get('/:name/jobs', authenticate, wrap(ctrl.jobHistory));
router.post('/:name/jobs/:id/retry', authenticate, authorize('admin'), wrap(ctrl.retryJob));

export default router;
