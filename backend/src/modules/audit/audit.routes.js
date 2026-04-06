import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './audit.controller.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', authenticate, authorize('admin'), wrap(ctrl.listAudits));

export default router;
