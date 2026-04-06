import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import * as ctrl from './dashboard.controller.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/realtime', authenticate, wrap(ctrl.getRealtime));
router.get('/today', authenticate, wrap(ctrl.getToday));
router.get('/recent', authenticate, wrap(ctrl.getRecent));
router.get('/weekly', authenticate, wrap(ctrl.getWeekly));

export default router;
