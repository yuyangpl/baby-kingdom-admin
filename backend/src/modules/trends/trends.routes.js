import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './trends.controller.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', authenticate, wrap(ctrl.list));
router.post('/trigger', authenticate, authorize('admin'), wrap(ctrl.trigger));
router.post('/medialens/request-otp', authenticate, authorize('admin'), wrap(ctrl.requestOtp));
router.post('/medialens/verify-otp', authenticate, authorize('admin'), wrap(ctrl.verifyOtp));
router.get('/medialens/token-status', authenticate, authorize('admin'), wrap(ctrl.tokenStatus));

export default router;
