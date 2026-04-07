import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { loginLimiter, refreshLimiter } from '../../shared/middleware/rate-limit.js';
import * as ctrl from './auth.controller.js';

const router = Router();

// Wrap async handlers
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// Public
router.post('/login', loginLimiter, wrap(ctrl.login));
router.post('/refresh', refreshLimiter, wrap(ctrl.refresh));
router.post('/logout', wrap(ctrl.logout));

// Authenticated
router.get('/me', authenticate, wrap(ctrl.getMe));
router.put('/password', authenticate, wrap(ctrl.changePassword));

// Admin only
router.post('/register', authenticate, authorize('admin'), wrap(ctrl.register));
router.get('/users', authenticate, authorize('admin'), wrap(ctrl.listUsers));
router.put('/users/:id/role', authenticate, authorize('admin'), wrap(ctrl.updateUserRole));
router.delete('/users/:id', authenticate, authorize('admin'), wrap(ctrl.deleteUser));

export default router;
