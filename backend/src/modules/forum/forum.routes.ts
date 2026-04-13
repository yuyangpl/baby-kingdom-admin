import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import * as ctrl from './forum.controller.js';
import { syncForumIndex } from '../poster/poster.controller.js';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.get('/', authenticate, wrap(ctrl.getTree));
router.post('/sync', authenticate, authorize('admin', 'editor'), wrap(syncForumIndex));
router.post('/categories', authenticate, authorize('admin', 'editor'), wrap(ctrl.createCategory));
router.put('/categories/:id', authenticate, authorize('admin', 'editor'), wrap(ctrl.updateCategory));
router.post('/boards', authenticate, authorize('admin', 'editor'), wrap(ctrl.createBoard));
router.put('/boards/:id', authenticate, authorize('admin', 'editor'), wrap(ctrl.updateBoard));
router.put('/boards/:id/personas', authenticate, authorize('admin', 'editor'), wrap(ctrl.updateBoardPersonas));
router.delete('/boards/:id', authenticate, authorize('admin', 'editor'), wrap(ctrl.deleteBoard));

export default router;
