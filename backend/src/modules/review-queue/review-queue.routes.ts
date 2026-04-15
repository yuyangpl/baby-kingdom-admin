import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './review-queue.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// Static routes before parameterized
router.post('/claim-batch', authenticate, authorize('admin', 'approver'), wrap(ctrl.claimBatch));
router.get('/my-workbench', authenticate, authorize('admin', 'approver'), wrap(ctrl.getMyWorkbench));
router.post('/extend-claims', authenticate, authorize('admin', 'approver'), wrap(ctrl.extendClaims));
router.post('/release-claims', authenticate, authorize('admin', 'approver'), wrap(ctrl.releaseClaims));
router.get('/my-stats', authenticate, wrap(ctrl.getMyStats));
router.get('/stats', authenticate, wrap(ctrl.getStats));

// Parameterized routes
router.post('/:id/publish', authenticate, authorize('admin', 'approver'), wrap(ctrl.publish));
router.post('/:id/reject', authenticate, authorize('admin', 'approver'), wrap(ctrl.reject));
router.post('/:id/skip', authenticate, authorize('admin', 'approver'), wrap(ctrl.skip));

export default router;
