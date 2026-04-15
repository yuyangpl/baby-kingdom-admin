import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { generateLimiter } from '../../shared/middleware/rate-limit.js';
import * as ctrl from './feed.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// Static routes MUST come before parameterized routes
router.get('/', authenticate, wrap(ctrl.list));
router.post('/custom-generate', generateLimiter, authenticate, authorize('admin', 'approver'), wrap(ctrl.customGenerate));
router.post('/batch/publish', authenticate, authorize('admin', 'approver'), wrap(ctrl.batchPublish));
router.post('/batch/reject', authenticate, authorize('admin', 'approver'), wrap(ctrl.batchReject));

// Parameterized routes
router.get('/:id', authenticate, wrap(ctrl.getById));
router.post('/:id/publish', authenticate, authorize('admin', 'approver'), wrap(ctrl.publish));
router.post('/:id/reject', authenticate, authorize('admin', 'approver'), wrap(ctrl.reject));
router.post('/:id/revert-pending', authenticate, authorize('admin', 'approver'), wrap(ctrl.revertToPending));
router.put('/:id/content', authenticate, authorize('admin', 'approver'), wrap(ctrl.updateContent));
router.post('/:id/regenerate', generateLimiter, authenticate, authorize('admin', 'approver'), wrap(ctrl.regenerate));

export default router;
