import { Request, Response } from 'express';
import { isDBConnected } from '../../shared/database.js';
import { isRedisConnected } from '../../shared/redis.js';
import { checkAllServices } from '../../shared/health-monitor.js';

export function getHealth(req: Request, res: Response): void {
  const mongoOk = isDBConnected();
  const redisOk = isRedisConnected();
  const healthy = mongoOk && redisOk;

  const body = {
    success: healthy,
    data: {
      status: healthy ? 'healthy' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
      },
    },
  };

  res.status(healthy ? 200 : 503).json(body);
}

export async function getServiceHealth(req: Request, res: Response): Promise<void> {
  const results = await checkAllServices();
  res.json({ success: true, data: results });
}
