import { Router, Request, Response } from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { getTaskLogs, getLatestTaskLog } from './task-log.service.js';
import { success, paginated } from '../../shared/response.js';

const router = Router();

// GET /api/v1/task-logs/:taskName/latest — get latest log (must be before /:taskName)
router.get('/:taskName/latest', authenticate, async (req: Request, res: Response) => {
  const taskName = req.params.taskName as string;
  const log = await getLatestTaskLog(taskName);
  success(res, log);
});

// GET /api/v1/task-logs/:taskName — get logs for a specific task
router.get('/:taskName', authenticate, async (req: Request, res: Response) => {
  const taskName = req.params.taskName as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await getTaskLogs(taskName, { page, limit });
  paginated(res, result.data, result.pagination);
});

export default router;
