import { Router } from 'express';
import { getHealth, getServiceHealth } from './health.controller.js';

const router = Router();

router.get('/', getHealth);
router.get('/services', getServiceHealth);

export default router;
