import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './config.controller.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', authenticate, authorize('admin'), wrap(ctrl.getAll));
router.get('/:category', authenticate, authorize('admin'), wrap(ctrl.getByCategory));
router.put('/:key', authenticate, authorize('admin'), wrap(ctrl.updateValue));

export default router;
