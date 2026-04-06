import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './forum.controller.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', authenticate, wrap(ctrl.getTree));
router.post('/categories', authenticate, authorize('admin'), wrap(ctrl.createCategory));
router.put('/categories/:id', authenticate, authorize('admin'), wrap(ctrl.updateCategory));
router.post('/boards', authenticate, authorize('admin'), wrap(ctrl.createBoard));
router.put('/boards/:id', authenticate, authorize('admin'), wrap(ctrl.updateBoard));
router.put('/boards/:id/personas', authenticate, authorize('admin'), wrap(ctrl.updateBoardPersonas));
router.delete('/boards/:id', authenticate, authorize('admin'), wrap(ctrl.deleteBoard));

export default router;
