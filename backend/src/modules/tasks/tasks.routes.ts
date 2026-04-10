// backend/src/modules/tasks/tasks.routes.ts
import { Router } from 'express';
import { scannerTask, trendsTask, posterTask, gtrendsTask } from './tasks.controller.js';

const router = Router();

router.post('/scanner', scannerTask);
router.post('/trends', trendsTask);
router.post('/poster', posterTask);
router.post('/gtrends', gtrendsTask);

export default router;
