import { Request, Response } from 'express';
import { isDBConnected } from '../../shared/database.js';
import { checkAllServices } from '../../shared/health-monitor.js';

export function getHealth(req: Request, res: Response): void {
  const dbOk = isDBConnected();

  const body = {
    success: dbOk,
    data: {
      status: dbOk ? 'healthy' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        postgresql: dbOk ? 'connected' : 'disconnected',
      },
    },
  };

  res.status(dbOk ? 200 : 503).json(body);
}

export async function getServiceHealth(req: Request, res: Response): Promise<void> {
  const results = await checkAllServices();
  res.json({ success: true, data: results });
}
