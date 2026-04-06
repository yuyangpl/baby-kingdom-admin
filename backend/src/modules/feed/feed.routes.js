import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './feed.controller.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Static routes MUST come before parameterized routes
router.get('/', authenticate, wrap(ctrl.list));
router.post('/custom-generate', authenticate, authorize('admin', 'editor'), wrap(ctrl.customGenerate));
router.post('/batch/approve', authenticate, authorize('admin', 'editor'), wrap(ctrl.batchApprove));
router.post('/batch/reject', authenticate, authorize('admin', 'editor'), wrap(ctrl.batchReject));

// Parameterized routes
router.get('/:id', authenticate, wrap(ctrl.getById));
router.post('/:id/approve', authenticate, authorize('admin', 'editor'), wrap(ctrl.approve));
router.post('/:id/reject', authenticate, authorize('admin', 'editor'), wrap(ctrl.reject));
router.put('/:id/content', authenticate, authorize('admin', 'editor'), wrap(ctrl.updateContent));
router.post('/:id/claim', authenticate, authorize('admin', 'editor'), wrap(ctrl.claim));
router.post('/:id/unclaim', authenticate, authorize('admin', 'editor'), wrap(ctrl.unclaim));
router.post('/:id/regenerate', authenticate, authorize('admin', 'editor'), wrap(ctrl.regenerate));

export default router;
