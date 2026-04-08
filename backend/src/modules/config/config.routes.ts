import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './config.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/', authenticate, authorize('admin'), wrap(ctrl.getAll));
router.post('/reset', authenticate, authorize('admin'), wrap(ctrl.resetDefaults));
router.post('/test-email', authenticate, authorize('admin'), wrap(ctrl.testEmail));
router.get('/reveal/:key', authenticate, authorize('admin'), wrap(ctrl.revealSecret));
router.get('/:category', authenticate, authorize('admin'), wrap(ctrl.getByCategory));
router.put('/:key', authenticate, authorize('admin'), wrap(ctrl.updateValue));

export default router;
