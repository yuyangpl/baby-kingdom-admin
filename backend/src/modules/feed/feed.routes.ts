import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { generateLimiter } from '../../shared/middleware/rate-limit.js';
import * as ctrl from './feed.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// Static routes MUST come before parameterized routes
router.get('/', authenticate, wrap(ctrl.list));
router.post('/custom-generate', generateLimiter, authenticate, authorize('admin', 'editor'), wrap(ctrl.customGenerate));
router.post('/batch/approve', authenticate, authorize('admin', 'approver'), wrap(ctrl.batchApprove));
router.post('/batch/reject', authenticate, authorize('admin', 'approver'), wrap(ctrl.batchReject));

// Parameterized routes
router.get('/:id', authenticate, wrap(ctrl.getById));
router.post('/:id/approve', authenticate, authorize('admin', 'approver'), wrap(ctrl.approve));
router.post('/:id/reject', authenticate, authorize('admin', 'approver'), wrap(ctrl.reject));
router.put('/:id/content', authenticate, authorize('admin', 'editor'), wrap(ctrl.updateContent));
router.put('/:id/assign', authenticate, authorize('admin'), wrap(ctrl.assign));
router.post('/:id/regenerate', generateLimiter, authenticate, authorize('admin', 'editor'), wrap(ctrl.regenerate));

export default router;
