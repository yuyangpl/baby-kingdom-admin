import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './trends.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/', authenticate, wrap(ctrl.list));
router.post('/trigger', authenticate, authorize('admin'), wrap(ctrl.trigger));
router.post('/medialens/request-otp', authenticate, authorize('admin'), wrap(ctrl.requestOtp));
router.post('/medialens/verify-otp', authenticate, authorize('admin'), wrap(ctrl.verifyOtp));
router.post('/medialens/refresh-token', authenticate, authorize('admin'), wrap(ctrl.refreshToken));
router.get('/medialens/token-status', authenticate, authorize('admin'), wrap(ctrl.tokenStatus));

export default router;
